import { Inject, Injectable } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type pg from 'pg';
import { notFound } from '../../common/errors.js';
import { CONFIG, type Config } from '../../config.js';
import { audit } from '../../infra/audit.js';
import { NOTIFIER, type Notifier } from '../../infra/notifier.js';
import { PG } from '../../infra/tokens.js';

/** No 0/O, 1/I/L: codes are read aloud and typed on phones. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const newInviteCode = () => `C2P-${Array.from({ length: 8 }, (_, i) => (i === 4 ? '-' : '') + ALPHABET[randomInt(ALPHABET.length)]).join('')}`;

export interface InviteRow {
  code: string; note: string | null; maxUses: number; uses: number; email: string | null;
  expiresAt: Date | null; revokedAt: Date | null; createdAt: Date; createdBy: string | null;
}

/**
 * Private beta (cahier des charges p. 20, Ph.7: 50 candidates) and waitlist (p. 27). The landing page collects
 * addresses; the administrator invites them, or creates codes to hand out (schools, partners).
 */
@Injectable()
export class BetaService {
  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  async listInvites(): Promise<InviteRow[]> {
    const { rows } = await this.pool.query<InviteRow>(
      `SELECT i.code, i.note, i.max_uses AS "maxUses", i.uses, i.email, i.expires_at AS "expiresAt", i.revoked_at AS "revokedAt",
              i.created_at AS "createdAt", u.email AS "createdBy"
         FROM invites i LEFT JOIN users u ON u.id = i.created_by ORDER BY i.created_at DESC LIMIT 500`,
    );
    return rows;
  }

  async createInvites(adminId: string, input: { count: number; maxUses: number; note?: string; expiresInDays?: number }) {
    const codes: string[] = [];
    for (let i = 0; i < input.count; i++) {
      const { rows: [r] } = await this.pool.query<{ code: string }>(
        `INSERT INTO invites (code, note, max_uses, expires_at, created_by)
         VALUES ($1, $2, $3, CASE WHEN $4::int IS NULL THEN NULL ELSE now() + make_interval(days => $4::int) END, $5)
         ON CONFLICT (code) DO NOTHING RETURNING code`,
        [newInviteCode(), input.note ?? null, input.maxUses, input.expiresInDays ?? null, adminId],
      );
      if (r) codes.push(r.code);
      else i--; // code collision: draw again
    }
    await audit(this.pool, { actorId: adminId, action: 'admin.invites_created', meta: { count: codes.length, maxUses: input.maxUses, note: input.note } });
    return codes;
  }

  async revoke(adminId: string, code: string) {
    const { rowCount } = await this.pool.query('UPDATE invites SET revoked_at = coalesce(revoked_at, now()) WHERE code = $1', [code]);
    if (!rowCount) throw notFound('Invitation');
    await audit(this.pool, { actorId: adminId, action: 'admin.invite_revoked', meta: { code } });
    return { revoked: true };
  }

  /** One line per address (latest sign-up), with whether it was invited and whether it already has an account. */
  async listLeads(q?: string) {
    const { rows } = await this.pool.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (lower(l.email)) l.id, lower(l.email) AS email, l.country, l.source, l.created_at AS "createdAt",
                max(l.invited_at) OVER (PARTITION BY lower(l.email)) AS "invitedAt",
                EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(l.email) AND u.status <> 'deleted') AS registered
           FROM leads l
          WHERE $1::text IS NULL OR l.email ILIKE '%' || $1 || '%'
          ORDER BY lower(l.email), l.created_at DESC
       ) x ORDER BY "createdAt" DESC LIMIT 1000`,
      [q || null],
    );
    return rows;
  }

  /** Sends a single-use code to each chosen waitlist address that has neither an account nor an earlier invitation. */
  async inviteLeads(adminId: string, ids: string[]) {
    const { rows: leads } = await this.pool.query<{ email: string }>(
      `SELECT DISTINCT lower(l.email) AS email FROM leads l
        WHERE l.id = ANY($1::uuid[])
          AND NOT EXISTS (SELECT 1 FROM leads o WHERE lower(o.email) = lower(l.email) AND o.invited_at IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(l.email) AND u.status <> 'deleted')`,
      [ids],
    );
    const sent: string[] = [];
    for (const { email } of leads) {
      const [code] = await this.createCode(adminId, email);
      const link = `${this.config.PUBLIC_WEB_URL}/inscription?invitation=${encodeURIComponent(code)}`;
      try {
        await this.notifier.send({
          channel: 'email', to: email, subject: 'Votre invitation à la bêta de C2Pass',
          text: `Bonjour,\n\nVous vous êtes inscrit(e) sur la liste d’attente de C2Pass. Une place vous attend dans la bêta privée : préparez le TCF Canada avec des simulations en conditions réelles et une correction calibrée C2.\n\nCréez votre compte avec ce lien (code ${code}, valable 30 jours) :\n${link}\n\nÀ très vite,\nL’équipe C2Pass`,
        });
        await this.pool.query('UPDATE leads SET invited_at = now() WHERE lower(email) = $1', [email]);
        sent.push(email);
      } catch {
        await this.pool.query('UPDATE invites SET revoked_at = now() WHERE code = $1', [code]); // not delivered: no orphan code
      }
    }
    await audit(this.pool, { actorId: adminId, action: 'admin.waitlist_invited', meta: { requested: ids.length, sent: sent.length } });
    return { sent: sent.length, skipped: ids.length - sent.length };
  }

  /** Right to erasure for a waitlist address (it has no account to delete). */
  async deleteLead(adminId: string, id: string) {
    const { rows } = await this.pool.query<{ email: string }>(
      `DELETE FROM leads WHERE lower(email) = (SELECT lower(email) FROM leads WHERE id = $1) RETURNING email`, [id]);
    if (!rows.length) throw notFound('Inscription');
    await this.pool.query('UPDATE invites SET email = NULL WHERE lower(email) = lower($1)', [rows[0].email]);
    await audit(this.pool, { actorId: adminId, action: 'admin.lead_deleted', meta: { count: rows.length } });
    return { deleted: rows.length };
  }

  private async createCode(adminId: string, email: string) {
    for (;;) {
      const { rows } = await this.pool.query<{ code: string }>(
        `INSERT INTO invites (code, note, max_uses, email, expires_at, created_by) VALUES ($1, 'Liste d’attente', 1, $2, now() + interval '30 days', $3)
         ON CONFLICT (code) DO NOTHING RETURNING code`,
        [newInviteCode(), email, adminId],
      );
      if (rows.length) return [rows[0].code];
    }
  }
}
