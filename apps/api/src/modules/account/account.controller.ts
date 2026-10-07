import { Body, Controller, Delete, Get, HttpCode, Inject, Patch, Put, Req } from '@nestjs/common';
import { COUNTRIES } from '@c2pass/shared';
import type { Request } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { clientIp, CurrentUser, type AuthUser } from '../../common/auth.js';
import { audit } from '../../infra/audit.js';
import { Cipher } from '../../infra/crypto.js';
import { withTransaction } from '../../infra/database.js';
import { PG } from '../../infra/tokens.js';
import { ContentRepository } from '../content/content.repository.js';

const countryCodes = COUNTRIES.map((c) => c.code) as [string, ...string[]];
const phone = z.string().regex(/^\+?[0-9 ]{8,20}$/, 'Numéro invalide').nullable().optional();

/** Data the candidate keeps in the vault to fill official registration forms quickly (by hand). */
const vaultSchema = z.object({
  lastName: z.string().max(80).optional(),
  firstName: z.string().max(80).optional(),
  birthDate: z.string().max(20).optional(),
  birthPlace: z.string().max(120).optional(),
  nationality: z.string().max(80).optional(),
  gender: z.string().max(20).optional(),
  passportNumber: z.string().max(40).optional(),
  passportExpiry: z.string().max(20).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(80).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().max(120).optional(),
  motherTongue: z.string().max(60).optional(),
  examReason: z.string().max(120).optional(),
});

@Controller('me')
export class AccountController {
  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(Cipher) private readonly cipher: Cipher,
    @Inject(ContentRepository) private readonly content: ContentRepository,
  ) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const { rows: [r] } = await this.pool.query(
      `SELECT u.id, u.email, u.role, u.totp_enabled AS "totpEnabled", u.plan_id AS "planId", u.plan_expires_at AS "planExpiresAt",
              u.c2_guarantee_until AS "c2GuaranteeUntil", u.created_at AS "createdAt", u.password_hash IS NOT NULL AS "hasPassword",
              (u.google_id IS NOT NULL) AS "google", (u.facebook_id IS NOT NULL) AS "facebook",
              p.first_name AS "firstName", p.last_name AS "lastName", p.country, p.city, p.phone, p.whatsapp,
              p.target_score AS "targetScore", p.exam_date AS "examDate", p.marketing_consent AS "marketingConsent"
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`,
      [user.id],
    );
    return { ...r, plan: user.plan, planActive: user.plan.id !== 'free' };
  }

  @Patch()
  async update(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const b = z.object({
      firstName: z.string().trim().min(1).max(80).optional(),
      lastName: z.string().trim().min(1).max(80).optional(),
      country: z.enum(countryCodes).nullable().optional(),
      city: z.string().max(80).nullable().optional(),
      phone, whatsapp: phone,
      targetScore: z.enum(['B2', 'C1', 'C2']).optional(),
      examDate: z.iso.date().nullable().optional(),
      marketingConsent: z.boolean().optional(),
    }).parse(body);
    const map: Record<string, string> = { firstName: 'first_name', lastName: 'last_name', country: 'country', city: 'city', phone: 'phone', whatsapp: 'whatsapp', targetScore: 'target_score', examDate: 'exam_date', marketingConsent: 'marketing_consent' };
    const entries = Object.entries(b).filter(([, v]) => v !== undefined);
    if (entries.length) {
      await this.pool.query(
        `INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING`, [user.id]);
      await this.pool.query(
        `UPDATE profiles SET ${entries.map(([k], i) => `${map[k]} = $${i + 2}`).join(', ')}, updated_at = now() WHERE user_id = $1`,
        [user.id, ...entries.map(([, v]) => v)],
      );
    }
    return this.me(user);
  }

  // ------------------------------------------------------------ coffre-fort (CandidateVault)

  @Get('vault')
  async vault(@CurrentUser() user: AuthUser, @Req() req: Request) {
    const { rows: [v] } = await this.pool.query<{ encrypted_data: string; iv: string; auth_tag: string; updated_at: Date }>(
      'SELECT encrypted_data, iv, auth_tag, updated_at FROM candidate_vault WHERE user_id = $1', [user.id]);
    if (!v) return { data: {}, updatedAt: null };
    await audit(this.pool, { userId: user.id, actorId: user.id, action: 'vault.read', ip: clientIp(req) });
    const data = JSON.parse(this.cipher.open({ ciphertext: v.encrypted_data, iv: v.iv, tag: v.auth_tag }, user.id));
    return { data, updatedAt: v.updated_at };
  }

  @Put('vault')
  async saveVault(@CurrentUser() user: AuthUser, @Body() body: unknown, @Req() req: Request) {
    const data = vaultSchema.parse(body);
    const sealed = this.cipher.seal(JSON.stringify(data), user.id);
    await this.pool.query(
      `INSERT INTO candidate_vault (user_id, encrypted_data, iv, auth_tag, kms_key_id) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET encrypted_data = $2, iv = $3, auth_tag = $4, kms_key_id = $5, updated_at = now()`,
      [user.id, sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyId],
    );
    await audit(this.pool, { userId: user.id, actorId: user.id, action: 'vault.write', ip: clientIp(req) });
    return { data, updatedAt: new Date() };
  }

  @Delete('vault')
  @HttpCode(204)
  async deleteVault(@CurrentUser() user: AuthUser) {
    await this.pool.query('DELETE FROM candidate_vault WHERE user_id = $1', [user.id]);
    await audit(this.pool, { userId: user.id, actorId: user.id, action: 'vault.delete' });
  }

  // ------------------------------------------------------------ RGPD

  /** Droit à la portabilité: everything C2Pass holds about the user, as JSON. */
  @Get('export')
  async export(@CurrentUser() user: AuthUser, @Req() req: Request) {
    const q = (sql: string) => this.pool.query(sql, [user.id]).then((r) => r.rows);
    const [account, sessions, practice, alerts, notifications, payments] = await Promise.all([
      q(`SELECT u.email, u.role, u.plan_id, u.plan_expires_at, u.created_at, p.* FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`),
      q(`SELECT id, type, skills, status, scores, total_score, started_at, completed_at FROM exam_sessions WHERE user_id = $1`),
      q(`SELECT skill, question_id, level, correct, created_at FROM practice_attempts WHERE user_id = $1`),
      q(`SELECT center_id, channels, status, created_at FROM session_alerts WHERE user_id = $1`),
      q(`SELECT channel, title, body, created_at FROM notifications WHERE user_id = $1`),
      q(`SELECT plan_id, amount, currency, method, status, created_at FROM payments WHERE user_id = $1`),
    ]);
    const writings = await this.content.writings.find({ userId: user.id }).toArray();
    const recordings = await this.content.audios.find({ userId: user.id }, { projection: { key: 0 } }).toArray();
    await audit(this.pool, { userId: user.id, actorId: user.id, action: 'gdpr.export', ip: clientIp(req) });
    return { exportedAt: new Date(), account: account[0], sessions, practice, alerts, notifications, payments, writings, recordings, vault: (await this.vault(user, req)).data };
  }

  /** Droit à l'oubli: personal data is erased; payments are kept anonymised for accounting. */
  @Delete()
  @HttpCode(204)
  async deleteAccount(@CurrentUser() user: AuthUser, @Req() req: Request) {
    await withTransaction(this.pool, async (tx) => {
      await tx.query(`DELETE FROM profiles WHERE user_id = $1`, [user.id]);
      await tx.query(`DELETE FROM candidate_vault WHERE user_id = $1`, [user.id]);
      await tx.query(`DELETE FROM session_alerts WHERE user_id = $1`, [user.id]);
      await tx.query(`DELETE FROM notifications WHERE user_id = $1`, [user.id]);
      await tx.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [user.id]);
      await tx.query(`DELETE FROM fraud_signals WHERE user_id = $1`, [user.id]);
      await tx.query(`UPDATE payments SET payer_phone = NULL WHERE user_id = $1`, [user.id]);
      await tx.query(
        `UPDATE users SET status = 'deleted', email = 'deleted-' || id || '@c2pass.invalid', password_hash = NULL,
                totp_secret = NULL, totp_enabled = false, google_id = NULL, facebook_id = NULL WHERE id = $1`,
        [user.id],
      );
      await audit(tx, { userId: user.id, actorId: user.id, action: 'gdpr.erase', ip: clientIp(req) });
    });
    await this.content.writings.deleteMany({ userId: user.id });
    await this.content.audios.deleteMany({ userId: user.id });
  }
}
