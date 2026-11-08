import { Inject, Injectable, Logger } from '@nestjs/common';
import { PLANS, type PlanId } from '@c2pass/shared';
import type pg from 'pg';
import { AppError, badRequest, notFound } from '../../common/errors.js';
import { CONFIG, type Config } from '../../config.js';
import { audit } from '../../infra/audit.js';
import { withTransaction } from '../../infra/database.js';
import { NOTIFIER, type Notifier } from '../../infra/notifier.js';
import { PG } from '../../infra/tokens.js';
import { buildGateways, PAYMENT_METHODS, UnavailableGateway, type PaymentGateway, type PaymentMethod, type PaymentStatus } from './gateways.js';

const MAX_PENDING_PAYMENTS = 3;

export interface PaymentRow {
  id: string;
  user_id: string;
  plan_id: PlanId;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus | 'refunded';
  provider_ref: string | null;
  checkout_url: string | null;
  callback_token: string | null;
  created_at: Date;
  confirmed_at: Date | null;
}

export function toPayment(p: PaymentRow) {
  return { id: p.id, planId: p.plan_id, amount: p.amount, currency: p.currency, method: p.method, status: p.status, checkoutUrl: p.checkout_url, createdAt: p.created_at, confirmedAt: p.confirmed_at };
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger('Billing');
  readonly gateways: Record<PaymentMethod, PaymentGateway>;

  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
  ) {
    this.gateways = buildGateways(config);
  }

  async checkout(userId: string, planId: PlanId, method: PaymentMethod, payerPhone?: string) {
    const plan = PLANS[planId];
    if (!plan || plan.priceXaf <= 0) throw badRequest('invalid_plan', 'Offre invalide');
    if ((method === 'orange_money' || method === 'mtn_momo') && !payerPhone) throw badRequest('phone_required', 'Numéro Mobile Money requis');
    if (this.gateways[method] instanceof UnavailableGateway) await this.gateways[method].checkout();
    // Each Mobile Money checkout sends a prompt to a phone: a few pending attempts at a time, no more.
    const { rows: [{ n }] } = await this.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM payments WHERE user_id = $1 AND status = 'pending' AND created_at > now() - interval '30 minutes'`,
      [userId],
    );
    if (n >= MAX_PENDING_PAYMENTS) throw new AppError(429, 'too_many_payments', 'Plusieurs paiements sont déjà en attente. Validez-les sur votre téléphone ou réessayez dans 30 minutes.');
    const { rows: [p] } = await this.pool.query<PaymentRow>(
      `INSERT INTO payments (user_id, plan_id, amount, method, payer_phone) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [userId, planId, plan.priceXaf, method, payerPhone ?? null],
    );
    const web = this.config.PUBLIC_WEB_URL;
    const result = await this.gateways[method].checkout({
      paymentId: p.id, amount: p.amount, payerPhone, description: `C2Pass – ${plan.name}`,
      // CinetPay sends the payer back with a POST, which the static site cannot take: the API redirects it.
      returnUrl: method === 'cinetpay' ? `${this.config.API_PUBLIC_URL}/api/payments/return/${p.id}` : `${web}/paiement/${p.id}`, cancelUrl: `${web}/tarifs?annule=1`,
      notifyUrl: `${this.config.API_PUBLIC_URL}/api/payments/webhook/${method.replace('_', '-')}`,
    });
    await this.pool.query(
      `UPDATE payments SET provider_ref = $2, checkout_url = $3, callback_token = $4 WHERE id = $1`,
      [p.id, result.providerRef, result.checkoutUrl ?? null, result.callbackToken ?? null],
    );
    if (result.status !== 'pending') await this.settle(p.id, result.status);
    return toPayment(await this.get(userId, p.id));
  }

  /** Payment methods that can take a payment right now (merchant keys present), for the payment form. */
  availableMethods(): PaymentMethod[] {
    return PAYMENT_METHODS.filter((m) => !(this.gateways[m] instanceof UnavailableGateway));
  }

  async get(userId: string, id: string): Promise<PaymentRow> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Paiement');
    const { rows: [p] } = await this.pool.query<PaymentRow>('SELECT * FROM payments WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!p) throw notFound('Paiement');
    return p;
  }

  /** Polled by the payment page: asks the provider while the payment is pending. */
  async refresh(userId: string, id: string) {
    const p = await this.get(userId, id);
    if (p.status === 'pending' && p.provider_ref) {
      try {
        const status = await this.gateways[p.method].status(p.provider_ref);
        if (status !== 'pending') await this.settle(p.id, status);
      } catch (e) {
        this.logger.warn(`status check ${p.id}: ${e instanceof Error ? e.message : e}`);
      }
    }
    return toPayment(await this.get(userId, id));
  }

  async list(userId: string) {
    const { rows } = await this.pool.query<PaymentRow>('SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return rows.map(toPayment);
  }

  async byProviderRef(method: PaymentMethod, ref: string) {
    const { rows: [p] } = await this.pool.query<PaymentRow>('SELECT * FROM payments WHERE method = $1 AND provider_ref = $2', [method, ref]);
    return p ?? null;
  }

  async byCallbackToken(method: PaymentMethod, token: string) {
    const { rows: [p] } = await this.pool.query<PaymentRow>('SELECT * FROM payments WHERE method = $1 AND callback_token = $2', [method, token]);
    return p ?? null;
  }

  async byId(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { rows: [p] } = await this.pool.query<PaymentRow>('SELECT * FROM payments WHERE id = $1', [id]);
    return p ?? null;
  }

  /** Moves a pending payment to its final state and, on success, activates the plan. Idempotent. */
  async settle(paymentId: string, status: PaymentStatus) {
    if (status === 'pending') return;
    const activated = await withTransaction(this.pool, async (tx) => {
      const { rows: [p] } = await tx.query<PaymentRow>(
        `UPDATE payments SET status = $2, confirmed_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`,
        [paymentId, status],
      );
      if (!p || status !== 'succeeded') return null;
      const plan = PLANS[p.plan_id];
      // Renewing the same plan extends it; switching plan starts from today.
      const { rows: [u] } = await tx.query<{ email: string; plan_expires_at: Date }>(
        `UPDATE users SET
            plan_expires_at = CASE WHEN plan_id = $2 AND plan_expires_at > now() THEN plan_expires_at ELSE now() END + make_interval(days => $3),
            plan_id = $2,
            c2_guarantee_until = CASE WHEN $4 THEN now() + make_interval(days => $3) ELSE c2_guarantee_until END
          WHERE id = $1 RETURNING email, plan_expires_at`,
        [p.user_id, plan.id, plan.durationDays, plan.c2Guarantee],
      );
      await audit(tx, { userId: p.user_id, action: 'plan.activated', meta: { paymentId: p.id, plan: plan.id, until: u.plan_expires_at } });
      return { email: u.email, plan: plan.name, until: u.plan_expires_at };
    });
    if (activated) {
      await this.notifier.send({
        channel: 'email', to: activated.email, subject: `Votre offre ${activated.plan} est active`,
        text: `Merci ! Votre offre ${activated.plan} est active jusqu’au ${activated.until.toLocaleDateString('fr-FR')}. Bonne préparation vers le C2 !`,
      }).catch(() => undefined);
    }
  }
}
