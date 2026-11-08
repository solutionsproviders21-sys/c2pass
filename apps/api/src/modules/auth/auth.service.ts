import { Inject, Injectable, Logger } from '@nestjs/common';
import argon2 from 'argon2';
import type pg from 'pg';
import { signAccessToken, type Role } from '../../common/auth.js';
import { AppError, badRequest, conflict, unauthorized } from '../../common/errors.js';
import { CONFIG, type Config } from '../../config.js';
import { audit } from '../../infra/audit.js';
import { Cipher, newTotpSecret, otpauthUrl, randomToken, sha256, verifyTotp } from '../../infra/crypto.js';
import { withTransaction, type Queryable } from '../../infra/database.js';
import { NOTIFIER, type Notifier } from '../../infra/notifier.js';
import { PG } from '../../infra/tokens.js';

const REFRESH_TTL_DAYS = 30;
const RESET_TTL_MINUTES = 60;
/** Reset emails per account per hour, so the form cannot be used to flood an inbox. */
const RESETS_PER_HOUR = 3;
const VERIFY_TTL_HOURS = 48;
const VERIFICATIONS_PER_HOUR = 3;

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
  inviteCode?: string;
}

export interface Fingerprint {
  fingerprint?: string;
  ip: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(Cipher) private readonly cipher: Cipher,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {}

  async register(input: RegisterInput, fp: Fingerprint): Promise<Tokens> {
    const hash = await argon2.hash(input.password, { type: argon2.argon2id });
    return withTransaction(this.pool, async (tx) => {
      const { rows: [existing] } = await tx.query(`SELECT 1 FROM users WHERE lower(email) = lower($1) AND status <> 'deleted'`, [input.email]);
      if (existing) throw conflict('email_taken', 'Un compte existe déjà avec cet e-mail');
      const invite = await this.redeemInvite(tx, input.inviteCode);
      const { rows: [user] } = await tx.query<{ id: string; role: Role }>(
        `INSERT INTO users (email, password_hash, invite_code) VALUES ($1, $2, $3) RETURNING id, role`,
        [input.email.trim().toLowerCase(), hash, invite],
      );
      await tx.query(
        `INSERT INTO profiles (user_id, first_name, last_name, country, city, phone, whatsapp, terms_accepted_at, marketing_consent)
         VALUES ($1, $2, $3, $4, $5, $6, $6, now(), $7)`,
        [user.id, input.firstName, input.lastName, input.country ?? null, input.city ?? null, input.phone ?? null, input.marketingConsent ?? false],
      );
      await audit(tx, { userId: user.id, actorId: user.id, action: 'account.created', meta: { method: 'email', invite, consent: { terms: true, marketing: !!input.marketingConsent } }, ip: fp.ip });
      await this.recordSignal(tx, user.id, fp, 'register');
      return { userId: user.id, tokens: await this.issueTokens(tx, user.id, user.role) };
    }).then(async ({ userId, tokens }) => {
      // The account is usable right away; alerts and payments wait for the address to be confirmed.
      await this.sendEmailVerification(userId).catch((e) => this.logger.warn(`verification e-mail failed: ${e instanceof Error ? e.message : e}`));
      return tokens;
    });
  }

  /** Sends a single-use confirmation link. Silent when already verified or when the hourly limit is reached. */
  async sendEmailVerification(userId: string) {
    const { rows: [u] } = await this.pool.query<{ email: string; first_name: string | null; email_verified_at: Date | null }>(
      `SELECT u.email, p.first_name, u.email_verified_at FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1 AND u.status = 'active'`,
      [userId],
    );
    if (!u || u.email_verified_at) return;
    const { rows: [{ n }] } = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM email_verifications WHERE user_id = $1 AND created_at > now() - interval '1 hour'`, [userId]);
    if (n >= VERIFICATIONS_PER_HOUR) return;
    const token = randomToken(32);
    await this.pool.query(
      `INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(hours => $3))`,
      [userId, sha256(token), VERIFY_TTL_HOURS],
    );
    await this.notifier.send({
      channel: 'email',
      to: u.email,
      subject: 'C2Pass : confirmez votre adresse e-mail',
      text: `Bonjour${u.first_name ? ` ${u.first_name}` : ''},\n\nBienvenue sur C2Pass ! Confirmez votre adresse en ouvrant ce lien (valable ${VERIFY_TTL_HOURS} heures). Cette confirmation est nécessaire pour recevoir les alertes d’ouverture des centres et pour souscrire une offre.`,
      url: `${this.config.PUBLIC_WEB_URL}/verifier-email?jeton=${token}`,
    });
  }

  async verifyEmail(token: string, ip: string | null) {
    await withTransaction(this.pool, async (tx) => {
      const { rows: [v] } = await tx.query<{ user_id: string }>(
        `UPDATE email_verifications SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
        [sha256(token)],
      );
      if (!v) throw badRequest('verification_link_invalid', 'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau depuis votre tableau de bord.');
      await tx.query('UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1', [v.user_id]);
      await audit(tx, { userId: v.user_id, actorId: v.user_id, action: 'email.verified', ip });
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

  /**
   * Optional TOTP enrolment for students and teachers. Needs the password (a stolen access token alone must not
   * be enough to attach the attacker's authenticator) and never replaces an active second factor.
   */
  async startTotpEnrolment(userId: string, email: string, password?: string) {
    const { rows: [u] } = await this.pool.query<{ password_hash: string | null; totp_enabled: boolean }>('SELECT password_hash, totp_enabled FROM users WHERE id = $1', [userId]);
    if (u.totp_enabled) throw conflict('totp_already_enabled', 'La double authentification est déjà active sur ce compte.');
    if (u.password_hash && (!password || !(await argon2.verify(u.password_hash, password)))) throw badRequest('wrong_password', 'Mot de passe incorrect');
    const secret = newTotpSecret();
    const challengeId = await this.createChallenge(userId, { setup: this.cipher.seal(secret, userId) });
    return { challengeId, secret, otpauthUrl: otpauthUrl(secret, email) };
  }

  async refresh(refreshToken: string): Promise<Tokens> {
    // A token already rotated a while ago coming back means it was copied: every session of that user is closed.
    // (The short grace period covers two tabs refreshing at the same moment.)
    const { rows: [reused] } = await this.pool.query<{ user_id: string }>(
      `SELECT user_id FROM refresh_tokens WHERE token_hash = $1 AND rotated AND revoked_at < now() - interval '30 seconds'`,
      [sha256(refreshToken)],
    );
    if (reused) {
      await this.pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [reused.user_id]);
      await audit(this.pool, { userId: reused.user_id, action: 'refresh_token.reused' });
      throw unauthorized('Session expirée');
    }
    return withTransaction(this.pool, async (tx) => {
      const { rows: [row] } = await tx.query<{ id: string; user_id: string; role: Role; status: string }>(
        `UPDATE refresh_tokens rt SET revoked_at = now(), rotated = true FROM users u
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

  /**
   * Sends a single-use reset link. Answers the same way whether or not the address exists,
   * so the form cannot be used to discover who has an account.
   */
  async requestPasswordReset(email: string, ip: string | null) {
    const { rows: [u] } = await this.pool.query<{ id: string; first_name: string | null }>(
      `SELECT u.id, p.first_name FROM users u LEFT JOIN profiles p ON p.user_id = u.id
        WHERE lower(u.email) = lower($1) AND u.status = 'active'`,
      [email],
    );
    if (!u) return;
    const { rows: [{ n }] } = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM password_resets WHERE user_id = $1 AND created_at > now() - interval '1 hour'`, [u.id]);
    if (n >= RESETS_PER_HOUR) return;
    const token = randomToken(32);
    await this.pool.query(
      `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))`,
      [u.id, sha256(token), RESET_TTL_MINUTES],
    );
    await audit(this.pool, { userId: u.id, actorId: null, action: 'password.reset_requested', ip });
    await this.notifier.send({
      channel: 'email',
      to: email,
      subject: 'C2Pass : réinitialisation de votre mot de passe',
      text: `Bonjour${u.first_name ? ` ${u.first_name}` : ''},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable ${RESET_TTL_MINUTES} minutes, utilisable une seule fois). Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.`,
      url: `${this.config.PUBLIC_WEB_URL}/mot-de-passe/nouveau?jeton=${token}`,
    });
  }

  /** Consumes a reset link: sets the new password and signs every device out. */
  async resetPassword(token: string, password: string, ip: string | null) {
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    await withTransaction(this.pool, async (tx) => {
      const { rows: [r] } = await tx.query<{ user_id: string }>(
        `UPDATE password_resets SET used_at = now()
          WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
        [sha256(token)],
      );
      if (!r) throw badRequest('reset_link_invalid', 'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.');
      // Opening the e-mailed link also proves the address.
      await tx.query(`UPDATE users SET password_hash = $2, email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1 AND status = 'active'`, [r.user_id, hash]);
      await tx.query(`UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [r.user_id]);
      await tx.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [r.user_id]);
      await audit(tx, { userId: r.user_id, actorId: r.user_id, action: 'password.reset', ip });
    });
  }

  /** Finds or creates the account behind an OAuth identity, linking by verified email. */
  async loginWithOAuth(provider: 'google' | 'facebook', identity: { id: string; email: string; firstName: string; lastName: string }, fp: Fingerprint): Promise<Tokens> {
    const column = provider === 'google' ? 'google_id' : 'facebook_id';
    return withTransaction(this.pool, async (tx) => {
      let { rows: [user] } = await tx.query<{ id: string; role: Role; status: string }>(`SELECT id, role, status FROM users WHERE ${column} = $1`, [identity.id]);
      if (!user) {
        // The provider proves ownership of the address. When the existing account never confirmed it, whoever
        // created it may not own the mailbox (pre-registration hijack): the password,
        // the second factor and the open sessions are dropped, and the owner can set a new password from the profile.
        const { rows: [prior] } = await tx.query<{ id: string; unproven: boolean }>(
          `SELECT id, (email_verified_at IS NULL AND password_hash IS NOT NULL) AS unproven
             FROM users WHERE lower(email) = lower($1) AND status <> 'deleted' FOR UPDATE`,
          [identity.email],
        );
        if (prior?.unproven) {
          await tx.query('UPDATE users SET password_hash = NULL, totp_secret = NULL, totp_enabled = false WHERE id = $1', [prior.id]);
          await tx.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [prior.id]);
          await audit(tx, { userId: prior.id, actorId: prior.id, action: 'account.claimed_by_oauth', meta: { provider } });
        }
        if (prior) {
          ({ rows: [user] } = await tx.query(
            `UPDATE users SET ${column} = $2, email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1 RETURNING id, role, status`,
            [prior.id, identity.id],
          ));
        }
      }
      if (!user) {
        // Private beta: invitees create their account with their code first, then may link Google or Facebook.
        if (this.config.SIGNUP_MODE === 'invite') throw new AppError(403, 'invite_required', 'Les inscriptions se font sur invitation pendant la bêta');
        ({ rows: [user] } = await tx.query(`INSERT INTO users (email, ${column}, email_verified_at) VALUES ($1, $2, now()) RETURNING id, role, status`, [identity.email.toLowerCase(), identity.id]));
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

  /**
   * Uses one seat of an invitation code. In invite mode a valid code is required; in open mode a valid code is still
   * recorded (to follow the beta cohort) and an invalid one is ignored.
   */
  private async redeemInvite(tx: pg.PoolClient, code: string | undefined): Promise<string | null> {
    const required = this.config.SIGNUP_MODE === 'invite';
    const { rows: [invite] } = code ? await tx.query<{ code: string }>(
      `UPDATE invites SET uses = uses + 1
        WHERE code = upper($1) AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now()) AND uses < max_uses
        RETURNING code`,
      [code.trim()],
    ) : { rows: [] };
    if (!invite && required) {
      throw new AppError(403, code ? 'invite_invalid' : 'invite_required', code
        ? 'Ce code d’invitation n’est pas valable (déjà utilisé, expiré ou mal saisi).'
        : 'Les inscriptions se font sur invitation pendant la bêta : saisissez votre code d’invitation.');
    }
    return invite?.code ?? null;
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
      // The payload (which may hold freshly issued tokens) is wiped as it is read.
      `UPDATE auth_challenges a SET used_at = now(), payload = '{}'::jsonb
         FROM (SELECT id, payload FROM auth_challenges WHERE id = $1 AND kind = $2 AND used_at IS NULL AND expires_at > now() FOR UPDATE) c
        WHERE a.id = c.id RETURNING c.payload`,
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
