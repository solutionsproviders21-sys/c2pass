import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PLANS, type PlanId } from '@c2pass/shared';
import type pg from 'pg';
import { AppError, badRequest, conflict, notFound } from '../../common/errors.js';
import { CONFIG, type Config } from '../../config.js';
import { audit } from '../../infra/audit.js';
import { withTransaction } from '../../infra/database.js';
import { JOBS, type Jobs } from '../../infra/jobs.js';
import { NOTIFIER, type Notifier } from '../../infra/notifier.js';
import { STORAGE, type Storage } from '../../infra/storage.js';
import { PG } from '../../infra/tokens.js';

/** CGU §8: an unused offer can be cancelled within 7 days of payment. */
export const WITHDRAWAL_DAYS = 7;
/** CGU §7: the C2 guarantee applies after following the programme for 3 months, with at least 3 full simulations. */
export const GUARANTEE_MIN_DAYS = 90;
export const GUARANTEE_MIN_SIMULATIONS = 3;
/** The guarantee claim stays open 6 months after the end of the pack, time to sit the official exam. */
export const GUARANTEE_CLAIM_DAYS = 270;
export const REMINDER_DAYS_BEFORE = 3;

export type RefundKind = 'withdrawal' | 'c2_guarantee';

interface PaymentForRefund {
  id: string; user_id: string; plan_id: PlanId; amount: number; method: string; status: string; confirmed_at: Date | null;
}

export interface Eligibility { eligible: boolean; reason?: string }

@Injectable()
export class RefundsService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Refunds');

  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
    @Inject(STORAGE) private readonly storage: Storage,
    @Inject(JOBS) private readonly jobs: Jobs,
  ) {}

  async onApplicationBootstrap() {
    this.jobs.register('billing.reminders', () => this.sendRenewalReminders().then(() => undefined));
    if (this.config.NODE_ENV !== 'test') await this.jobs.repeat('billing.reminders', 60 * 60_000);
  }

  private async payment(userId: string, paymentId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(paymentId)) throw notFound('Paiement');
    const { rows: [p] } = await this.pool.query<PaymentForRefund>('SELECT * FROM payments WHERE id = $1 AND user_id = $2', [paymentId, userId]);
    if (!p) throw notFound('Paiement');
    return p;
  }

  /** Whether this payment can be refunded under each rule, with the reason when it cannot. */
  async eligibility(userId: string, paymentId: string): Promise<Record<RefundKind, Eligibility>> {
    const p = await this.payment(userId, paymentId);
    const not = (reason: string): Eligibility => ({ eligible: false, reason });
    if (p.status !== 'succeeded' || !p.confirmed_at) return { withdrawal: not('Ce paiement n’a pas abouti.'), c2_guarantee: not('Ce paiement n’a pas abouti.') };
    const { rows: [open] } = await this.pool.query(`SELECT status FROM refund_requests WHERE payment_id = $1 AND status <> 'rejected'`, [p.id]);
    if (open) {
      const r = not(open.status === 'pending' ? 'Une demande est déjà en cours pour ce paiement.' : 'Ce paiement a déjà été remboursé.');
      return { withdrawal: r, c2_guarantee: r };
    }
    const days = (Date.now() - p.confirmed_at.getTime()) / 86_400_000;
    const { rows: [use] } = await this.pool.query<{ sessions: number; full: number; reviews: number }>(
      `SELECT (SELECT count(*)::int FROM exam_sessions WHERE user_id = $1 AND started_at >= $2) AS sessions,
              (SELECT count(*)::int FROM exam_sessions WHERE user_id = $1 AND type = 'full' AND status = 'completed' AND completed_at >= $2) AS full,
              (SELECT count(*)::int FROM human_reviews WHERE user_id = $1 AND created_at >= $2) AS reviews`,
      [p.user_id, p.confirmed_at],
    );
    const withdrawal = days > WITHDRAWAL_DAYS
      ? not(`Le délai de ${WITHDRAWAL_DAYS} jours après le paiement est dépassé.`)
      : use.sessions > 0 || use.reviews > 0
        ? not('L’offre a déjà été utilisée (simulation ou correction humaine).')
        : { eligible: true };
    const c2_guarantee = !PLANS[p.plan_id]?.c2Guarantee
      ? not('La garantie C2 concerne uniquement le Pack Réussite.')
      : days < GUARANTEE_MIN_DAYS
        ? not(`La garantie s’ouvre ${GUARANTEE_MIN_DAYS} jours après le paiement.`)
        : days > GUARANTEE_CLAIM_DAYS
          ? not('Le délai pour demander la garantie est dépassé.')
          : use.full < GUARANTEE_MIN_SIMULATIONS
            ? not(`Il faut au moins ${GUARANTEE_MIN_SIMULATIONS} simulations complètes terminées pendant le Pack (vous en avez ${use.full}).`)
            : { eligible: true };
    return { withdrawal, c2_guarantee };
  }

  async request(userId: string, paymentId: string, kind: RefundKind, reason: string | undefined, attestation?: { data: Buffer; contentType: string }) {
    const check = (await this.eligibility(userId, paymentId))[kind];
    if (!check.eligible) throw new AppError(422, 'refund_not_eligible', check.reason!);
    if (kind === 'c2_guarantee' && !attestation) throw badRequest('attestation_required', 'Joignez votre attestation officielle de résultats du TCF Canada.');
    let key: string | null = null;
    if (attestation) {
      key = `refunds/${userId}/${paymentId}-${Date.now()}`;
      await this.storage.put(key, attestation.data, attestation.contentType);
    }
    try {
      const { rows: [r] } = await this.pool.query(
        `INSERT INTO refund_requests (user_id, payment_id, kind, reason, attestation_key, attestation_type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, status, created_at AS "createdAt"`,
        [userId, paymentId, kind, reason ?? null, key, attestation?.contentType ?? null],
      );
      await audit(this.pool, { userId, actorId: userId, action: 'refund.requested', meta: { paymentId, kind } });
      return r;
    } catch (e) {
      if (key) await this.storage.delete(key).catch(() => undefined);
      if ((e as { code?: string }).code === '23505') throw conflict('refund_exists', 'Une demande existe déjà pour ce paiement.');
      throw e;
    }
  }

  async listForUser(userId: string) {
    const { rows } = await this.pool.query(
      `SELECT id, payment_id AS "paymentId", kind, status, admin_note AS "adminNote", created_at AS "createdAt", decided_at AS "decidedAt"
         FROM refund_requests WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
    return rows;
  }

  async listForAdmin(status?: string) {
    const { rows } = await this.pool.query(
      `SELECT r.id, r.kind, r.status, r.reason, r.admin_note AS "adminNote", r.created_at AS "createdAt", r.decided_at AS "decidedAt",
              r.attestation_key IS NOT NULL AS "hasAttestation", u.email, p.id AS "paymentId", p.plan_id AS "planId", p.amount, p.method,
              p.confirmed_at AS "paidAt"
         FROM refund_requests r JOIN users u ON u.id = r.user_id JOIN payments p ON p.id = r.payment_id
        WHERE ($1::text IS NULL OR r.status = $1) ORDER BY r.status = 'pending' DESC, r.created_at DESC LIMIT 200`,
      [status ?? null],
    );
    return rows;
  }

  async attestation(requestId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw notFound('Demande');
    const { rows: [r] } = await this.pool.query<{ attestation_key: string | null }>('SELECT attestation_key FROM refund_requests WHERE id = $1', [requestId]);
    const file = r?.attestation_key ? await this.storage.get(r.attestation_key) : null;
    if (!file) throw notFound('Attestation');
    return file;
  }

  /**
   * Approves or rejects a request. Approval marks the payment refunded and ends the offer it paid for; the money itself is
   * sent back from the Orange Money / MTN / Stripe merchant account, outside the platform.
   */
  async decide(adminId: string, requestId: string, approve: boolean, note: string | undefined) {
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw notFound('Demande');
    const decided = await withTransaction(this.pool, async (tx) => {
      const { rows: [r] } = await tx.query<{ user_id: string; payment_id: string; kind: string }>(
        `UPDATE refund_requests SET status = $2, admin_note = $3, decided_by = $4, decided_at = now()
          WHERE id = $1 AND status = 'pending' RETURNING user_id, payment_id, kind`,
        [requestId, approve ? 'approved' : 'rejected', note ?? null, adminId],
      );
      if (!r) throw conflict('refund_already_decided', 'Cette demande a déjà été traitée.');
      if (approve) await this.markRefunded(tx, r.payment_id);
      await audit(tx, { userId: r.user_id, actorId: adminId, action: approve ? 'refund.approved' : 'refund.rejected', meta: { requestId, paymentId: r.payment_id, kind: r.kind } });
      return r;
    });
    await this.notifyDecision(decided.user_id, approve, note);
    return { status: approve ? 'approved' : 'rejected' };
  }

  /** Refund decided by an administrator without a request from the candidate (goodwill, payment dispute). */
  async refundByAdmin(adminId: string, paymentId: string, note: string | undefined) {
    if (!/^[0-9a-f-]{36}$/i.test(paymentId)) throw notFound('Paiement');
    const userId = await withTransaction(this.pool, async (tx) => {
      const { rows: [p] } = await tx.query<{ user_id: string; status: string }>('SELECT user_id, status FROM payments WHERE id = $1 FOR UPDATE', [paymentId]);
      if (!p) throw notFound('Paiement');
      if (p.status !== 'succeeded') throw conflict('payment_not_refundable', 'Seul un paiement réussi peut être remboursé.');
      await tx.query(`UPDATE refund_requests SET status = 'rejected', admin_note = 'Remplacée par un remboursement direct', decided_by = $2, decided_at = now()
                       WHERE payment_id = $1 AND status = 'pending'`, [paymentId, adminId]);
      await tx.query(`INSERT INTO refund_requests (user_id, payment_id, kind, status, admin_note, decided_by, decided_at) VALUES ($1, $2, 'admin', 'approved', $3, $4, now())`,
        [p.user_id, paymentId, note ?? null, adminId]);
      await this.markRefunded(tx, paymentId);
      await audit(tx, { userId: p.user_id, actorId: adminId, action: 'refund.admin', meta: { paymentId } });
      return p.user_id;
    });
    await this.notifyDecision(userId, true, note);
    return { status: 'approved' };
  }

  private async markRefunded(tx: pg.PoolClient, paymentId: string) {
    const { rows: [p] } = await tx.query<{ user_id: string; plan_id: string }>(
      `UPDATE payments SET status = 'refunded' WHERE id = $1 AND status = 'succeeded' RETURNING user_id, plan_id`, [paymentId]);
    if (!p) throw conflict('payment_not_refundable', 'Seul un paiement réussi peut être remboursé.');
    // The refunded payment paid for the current offer unless a later payment for another plan replaced it.
    const { rows: [later] } = await tx.query(
      `SELECT 1 FROM payments WHERE user_id = $1 AND status = 'succeeded' AND id <> $2 AND plan_id = $3 AND confirmed_at > now() - interval '120 days'`,
      [p.user_id, paymentId, p.plan_id]);
    if (!later) {
      await tx.query(`UPDATE users SET plan_id = 'free', plan_expires_at = NULL, c2_guarantee_until = NULL WHERE id = $1 AND plan_id = $2`, [p.user_id, p.plan_id]);
    }
  }

  private async notifyDecision(userId: string, approved: boolean, note: string | undefined) {
    const { rows: [u] } = await this.pool.query<{ email: string }>(`SELECT email FROM users WHERE id = $1 AND status = 'active'`, [userId]);
    if (!u) return;
    await this.notifier.send({
      channel: 'email', to: u.email,
      subject: approved ? 'C2Pass : votre remboursement est accepté' : 'C2Pass : votre demande de remboursement',
      text: approved
        ? `Bonjour,\n\nVotre demande de remboursement est acceptée. Le montant vous est renvoyé sur le moyen de paiement utilisé.${note ? `\n\n${note}` : ''}`
        : `Bonjour,\n\nVotre demande de remboursement n’a pas pu être acceptée.${note ? `\n\nMotif : ${note}` : ''}\n\nVous pouvez répondre à cet e-mail pour toute question.`,
      url: `${this.config.PUBLIC_WEB_URL}/profil`,
    }).catch((e) => this.logger.warn(`refund e-mail: ${e instanceof Error ? e.message : e}`));
  }

  /** Hourly: e-mails candidates whose paid offer ends within 3 days, once per expiry date. */
  async sendRenewalReminders() {
    const { rows } = await this.pool.query<{ id: string; email: string; plan_id: PlanId; plan_expires_at: Date }>(
      `UPDATE users SET plan_reminded_for = plan_expires_at
        WHERE status = 'active' AND plan_id <> 'free'
          AND plan_expires_at BETWEEN now() AND now() + make_interval(days => $1)
          AND plan_reminded_for IS DISTINCT FROM plan_expires_at
        RETURNING id, email, plan_id, plan_expires_at`,
      [REMINDER_DAYS_BEFORE],
    );
    for (const u of rows) {
      const plan = PLANS[u.plan_id];
      await this.notifier.send({
        channel: 'email', to: u.email, subject: `C2Pass : votre offre ${plan?.name ?? ''} se termine bientôt`,
        text: `Bonjour,\n\nVotre offre ${plan?.name ?? ''} se termine le ${u.plan_expires_at.toLocaleDateString('fr-FR')}. Pour garder vos simulations, vos alertes et la correction IA, renouvelez-la en un clic. Rien n’est prélevé automatiquement.`,
        url: `${this.config.PUBLIC_WEB_URL}/tarifs?renouveler=${u.plan_id}`,
      }).catch((e) => this.logger.warn(`reminder ${u.id}: ${e instanceof Error ? e.message : e}`));
    }
    return rows.length;
  }

}
