import { Inject, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import type pg from 'pg';
import { signAccessToken, type Role } from '../../common/auth.js';
import { AppError, badRequest, conflict, unauthorized } from '../../common/errors.js';
import { CONFIG, type Config } from '../../config.js';
import { audit } from '../../infra/audit.js';
import { Cipher, newTotpSecret, otpauthUrl, randomToken, sha256, verifyTotp } from '../../infra/crypto.js';
import { withTransaction, type Queryable } from '../../infra/database.js';
import { PG } from '../../infra/tokens.js';

const REFRESH_TTL_DAYS = 30;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export type LoginResult =
  | Tokens
  | { totpRequired: true; challengeId: string }
  | { totpSetupRequired: true; challengeId: string; secret: string; otpauthUrl: string };

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  country?: string;
  city?: string;
  phone?: string;
  marketingConsent?: boolean;
}

export interface Fingerprint {
  fingerprint?: string;
  ip: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(Cipher) private readonly cipher: Cipher,
  ) {}

  async register(input: RegisterInput, fp: Fingerprint): Promise<Tokens> {
    const hash = await argon2.hash(input.password, { type: argon2.argon2id });
    return withTransaction(this.pool, async (tx) => {
      const { rows: [existing] } = await tx.query(`SELECT 1 FROM users WHERE lower(email) = lower($1) AND status <> 'deleted'`, [input.email]);
      if (existing) throw conflict('email_taken', 'Un compte existe déjà avec cet e-mail');
      const { rows: [user] } = await tx.query<{ id: string; role: Role }>(
        `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, role`,
        [input.email.trim().toLowerCase(), hash],
      );
      await tx.query(
        `INSERT INTO profiles (user_id, first_name, last_name, country, city, phone, whatsapp, terms_accepted_at, marketing_consent)
         VALUES ($1, $2, $3, $4, $5, $6, $6, now(), $7)`,
        [user.id, input.firstName, input.lastName, input.country ?? null, input.city ?? null, input.phone ?? null, input.marketingConsent ?? false],
      );
      await audit(tx, { userId: user.id, actorId: user.id, action: 'account.created', meta: { method: 'email', consent: { terms: true, marketing: !!input.marketingConsent } }, ip: fp.ip });
      await this.recordSignal(tx, user.id, fp, 'register');
      return this.issueTokens(tx, user.id, user.role);
    });
  }

  async login(email: string, password: string, fp: Fingerprint): Promise<LoginResult> {
    const { rows: [user] } = await this.pool.query<{ id: string; role: Role; password_hash: string | null; status: string; totp_enabled: boolean }>(
      `SELECT id, role, password_hash, status, totp_enabled FROM users WHERE lower(email) = lower($1) AND status <> 'deleted'`,
      [email],
    );
    // Same error whatever failed, so the endpoint does not reveal which emails exist.
    if (!user?.password_hash || !(await argon2.verify(user.password_hash, password))) throw unauthorized('E-mail ou mot de passe incorrect');
    if (user.status !== 'active') throw new AppError(403, 'account_suspended', 'Compte suspendu');
    await this.recordSignal(this.pool, user.id, fp, 'login');

    // TOTP is mandatory for administrators (cahier des charges §7) and optional for everyone else.
    if (user.totp_enabled) return { totpRequired: true, challengeId: await this.createChallenge(user.id, {}) };
    if (user.role === 'admin') {
      const secret = newTotpSecret();
      const challengeId = await this.createChallenge(user.id, { setup: this.cipher.seal(secret, user.id) });
      return { totpSetupRequired: true, challengeId, secret, otpauthUrl: otpauthUrl(secret, email) };
    }
    return this.issueTokens(this.pool, user.id, user.role);
  }

  async verifyTotp(challengeId: string, code: string): Promise<Tokens> {
    // The attempt counter is committed on its own, so failed guesses count even though the request fails.
    const { rows: [ch] } = await this.pool.query<{ id: string; user_id: string; payload: { setup?: ReturnType<Cipher['seal']> } }>(
      `UPDATE auth_challenges SET attempts = attempts + 1
        WHERE id = $1 AND kind = 'totp' AND used_at IS NULL AND expires_at > now() AND attempts < 5
        RETURNING id, user_id, payload`,
      [challengeId],
    );
    if (!ch) throw unauthorized('Code expiré, reconnectez-vous');
    const { rows: [user] } = await this.pool.query<{ role: Role; totp_secret: ReturnType<Cipher['seal']> | null }>('SELECT role, totp_secret FROM users WHERE id = $1', [ch.user_id]);
    const sealed = ch.payload.setup ?? user.totp_secret;
    if (!sealed || !verifyTotp(this.cipher.open(sealed, ch.user_id), code)) throw unauthorized('Code incorrect');

    return withTransaction(this.pool, async (tx) => {
      const { rowCount } = await tx.query('UPDATE auth_challenges SET used_at = now() WHERE id = $1 AND used_at IS NULL', [ch.id]);
      if (!rowCount) throw unauthorized('Code déjà utilisé');
      if (ch.payload.setup) {
        await tx.query('UPDATE users SET totp_secret = $2, totp_enabled = true WHERE id = $1', [ch.user_id, JSON.stringify(ch.payload.setup)]);
        await audit(tx, { userId: ch.user_id, actorId: ch.user_id, action: 'totp.enabled' });
      }
      return this.issueTokens(tx, ch.user_id, user.role);
    });
  }

  /** Optional TOTP enrolment for students and teachers. */
  async startTotpEnrolment(userId: string, email: string) {
    const secret = newTotpSecret();
    const challengeId = await this.createChallenge(userId, { setup: this.cipher.seal(secret, userId) });
    return { challengeId, secret, otpauthUrl: otpauthUrl(secret, email) };
  }

  async refresh(refreshToken: string): Promise<Tokens> {
    return withTransaction(this.pool, async (tx) => {
      const { rows: [row] } = await tx.query<{ id: string; user_id: string; role: Role; status: string }>(
        `UPDATE refresh_tokens rt SET revoked_at = now() FROM users u
          WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > now() AND u.id = rt.user_id
          RETURNING rt.id, rt.user_id, u.role, u.status`,
        [sha256(refreshToken)],
      );
      if (!row || row.status !== 'active') throw unauthorized('Session expirée');
      return this.issueTokens(tx, row.user_id, row.role);
    });
  }

  async logout(refreshToken: string) {
    await this.pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(refreshToken)]);
  }

  async changePassword(userId: string, current: string | undefined, next: string) {
    const { rows: [u] } = await this.pool.query<{ password_hash: string | null }>('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (u.password_hash && (!current || !(await argon2.verify(u.password_hash, current)))) throw badRequest('wrong_password', 'Mot de passe actuel incorrect');
    await this.pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, await argon2.hash(next, { type: argon2.argon2id })]);
    await this.pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
  }

  /** Finds or creates the account behind an OAuth identity, linking by verified email. */
  async loginWithOAuth(provider: 'google' | 'facebook', identity: { id: string; email: string; firstName: string; lastName: string }, fp: Fingerprint): Promise<Tokens> {
    const column = provider === 'google' ? 'google_id' : 'facebook_id';
    return withTransaction(this.pool, async (tx) => {
      let { rows: [user] } = await tx.query<{ id: string; role: Role; status: string }>(`SELECT id, role, status FROM users WHERE ${column} = $1`, [identity.id]);
      if (!user) {
        ({ rows: [user] } = await tx.query(
          `UPDATE users SET ${column} = $2 WHERE lower(email) = lower($1) AND status <> 'deleted' RETURNING id, role, status`,
          [identity.email, identity.id],
        ));
      }
      if (!user) {
        ({ rows: [user] } = await tx.query(`INSERT INTO users (email, ${column}) VALUES ($1, $2) RETURNING id, role, status`, [identity.email.toLowerCase(), identity.id]));
        await tx.query(`INSERT INTO profiles (user_id, first_name, last_name, terms_accepted_at) VALUES ($1, $2, $3, now())`, [user.id, identity.firstName, identity.lastName]);
        await audit(tx, { userId: user.id, actorId: user.id, action: 'account.created', meta: { method: provider } });
      }
      if (user.status !== 'active') throw new AppError(403, 'account_suspended', 'Compte suspendu');
      // OAuth does not replace the administrators' second factor.
      if (user.role === 'admin') throw new AppError(403, 'admin_requires_password', 'Les administrateurs se connectent par e-mail, mot de passe et code TOTP');
      await this.recordSignal(tx, user.id, fp, `login_${provider}`);
      return this.issueTokens(tx, user.id, user.role);
    });
  }

  async createChallenge(userId: string | null, payload: object, kind: 'totp' | 'oauth_state' = 'totp', ttlMinutes = 10): Promise<string> {
    const { rows: [c] } = await this.pool.query<{ id: string }>(
      `INSERT INTO auth_challenges (user_id, kind, payload, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4)) RETURNING id`,
      [userId, kind, JSON.stringify(payload), ttlMinutes],
    );
    return c.id;
  }

  async consumeChallenge<T>(id: string, kind: 'totp' | 'oauth_state'): Promise<T | null> {
    const { rows: [c] } = await this.pool.query<{ payload: T }>(
      `UPDATE auth_challenges SET used_at = now() WHERE id = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now() RETURNING payload`,
      [id, kind],
    );
    return c?.payload ?? null;
  }

  private async issueTokens(db: Queryable, userId: string, role: Role): Promise<Tokens> {
    const refreshToken = randomToken();
    await db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
      [userId, sha256(refreshToken), REFRESH_TTL_DAYS],
    );
    return { accessToken: signAccessToken(this.config.JWT_SECRET, { sub: userId, role }), refreshToken };
  }

  private async recordSignal(db: Queryable, userId: string, fp: Fingerprint, event: string) {
    await db.query('INSERT INTO fraud_signals (user_id, fingerprint, ip, event) VALUES ($1, $2, $3, $4)', [userId, fp.fingerprint ?? null, fp.ip, event]);
  }
}
