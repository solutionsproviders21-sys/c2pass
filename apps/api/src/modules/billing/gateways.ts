import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { AppError } from '../../common/errors.js';
import type { Config } from '../../config.js';

export const PAYMENT_METHODS = ['orange_money', 'mtn_momo', 'cinetpay', 'stripe'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentStatus = 'pending' | 'succeeded' | 'failed';

export interface CheckoutRequest {
  paymentId: string;
  amount: number;
  description: string;
  payerPhone?: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
}

export interface CheckoutResult {
  providerRef: string;
  status: PaymentStatus;
  /** Where to send the payer (Orange Money web payment, Stripe Checkout). */
  checkoutUrl?: string;
  /** Secret the provider echoes in its callback (Orange Money notif_token). */
  callbackToken?: string;
}

/** Port implemented by each payment provider. Callbacks are always re-verified with `status`. */
export interface PaymentGateway {
  checkout(req: CheckoutRequest): Promise<CheckoutResult>;
  status(providerRef: string): Promise<PaymentStatus>;
}

/**
 * Sandbox used until merchant accounts are live: payments succeed instantly, except payer phones
 * ending in "0000", which fail (to exercise the failure path).
 */
export class SandboxGateway implements PaymentGateway {
  async checkout(req: CheckoutRequest): Promise<CheckoutResult> {
    const failed = req.payerPhone?.replace(/\s/g, '').endsWith('0000');
    return { providerRef: `sbx_${randomUUID()}`, status: failed ? 'failed' : 'succeeded' };
  }
  async status(): Promise<PaymentStatus> {
    return 'succeeded';
  }
}

/** A payment method whose merchant credentials are missing in live mode: refused, never silently free. */
export class UnavailableGateway implements PaymentGateway {
  async checkout(): Promise<CheckoutResult> {
    throw new AppError(503, 'payment_method_unavailable', 'Ce moyen de paiement n’est pas encore disponible. Choisissez-en un autre.');
  }
  async status(): Promise<PaymentStatus> {
    return 'pending';
  }
}

/** Orange Money Web Payment (Orange Developer API): redirect to Orange's payment page, notification on notif_url. */
export class OrangeMoneyGateway implements PaymentGateway {
  private token: { value: string; expiresAt: number } | null = null;
  private readonly pending = new Map<string, { orderId: string; amount: number; payToken: string }>();

  constructor(private readonly cfg: Config, private readonly country = 'cm') {}

  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const basic = Buffer.from(`${this.cfg.ORANGE_MONEY_CLIENT_ID}:${this.cfg.ORANGE_MONEY_CLIENT_SECRET}`).toString('base64');
    const res = await fetch(`${this.cfg.ORANGE_MONEY_BASE_URL}/oauth/v3/token`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) throw new Error(`Orange token request failed (${res.status})`);
    const b = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: b.access_token, expiresAt: Date.now() + b.expires_in * 1000 };
    return b.access_token;
  }

  async checkout(req: CheckoutRequest): Promise<CheckoutResult> {
    const res = await fetch(`${this.cfg.ORANGE_MONEY_BASE_URL}/orange-money-webpay/${this.country}/v1/webpayment`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        merchant_key: this.cfg.ORANGE_MONEY_MERCHANT_KEY,
        currency: 'XAF',
        order_id: req.paymentId,
        amount: req.amount,
        return_url: req.returnUrl,
        cancel_url: req.cancelUrl,
        notif_url: req.notifyUrl,
        lang: 'fr',
        reference: 'C2Pass',
      }),
    });
    if (!res.ok) throw new Error(`Orange Money web payment failed (${res.status})`);
    const b = (await res.json()) as { pay_token: string; payment_url: string; notif_token: string };
    this.pending.set(b.pay_token, { orderId: req.paymentId, amount: req.amount, payToken: b.pay_token });
    return { providerRef: b.pay_token, status: 'pending', checkoutUrl: b.payment_url, callbackToken: b.notif_token };
  }

  async status(payToken: string): Promise<PaymentStatus> {
    const p = this.pending.get(payToken);
    if (!p) return 'pending'; // the notification (verified by notif_token) is authoritative
    const res = await fetch(`${this.cfg.ORANGE_MONEY_BASE_URL}/orange-money-webpay/${this.country}/v1/transactionstatus`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ order_id: p.orderId, amount: p.amount, pay_token: p.payToken }),
    });
    if (!res.ok) return 'pending';
    const b = (await res.json()) as { status: string };
    return b.status === 'SUCCESS' ? 'succeeded' : b.status === 'FAILED' || b.status === 'EXPIRED' ? 'failed' : 'pending';
  }
}

/** MTN Mobile Money — Collection "Request to Pay": the payer approves on their phone. */
export class MtnMomoGateway implements PaymentGateway {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly cfg: Config) {}

  private async accessToken() {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const basic = Buffer.from(`${this.cfg.MTN_MOMO_API_USER}:${this.cfg.MTN_MOMO_API_KEY}`).toString('base64');
    const res = await fetch(`${this.cfg.MTN_MOMO_BASE_URL}/collection/token/`, {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Ocp-Apim-Subscription-Key': this.cfg.MTN_MOMO_SUBSCRIPTION_KEY ?? '' },
    });
    if (!res.ok) throw new Error(`MTN MoMo token request failed (${res.status})`);
    const b = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: b.access_token, expiresAt: Date.now() + b.expires_in * 1000 };
    return b.access_token;
  }

  private async headers() {
    return {
      Authorization: `Bearer ${await this.accessToken()}`,
      'X-Target-Environment': this.cfg.MTN_MOMO_TARGET_ENV,
      'Ocp-Apim-Subscription-Key': this.cfg.MTN_MOMO_SUBSCRIPTION_KEY ?? '',
      'Content-Type': 'application/json',
    };
  }

  async checkout(req: CheckoutRequest): Promise<CheckoutResult> {
    if (!req.payerPhone) throw new Error('payerPhone is required for MTN MoMo');
    const referenceId = randomUUID();
    const res = await fetch(`${this.cfg.MTN_MOMO_BASE_URL}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers: { ...(await this.headers()), 'X-Reference-Id': referenceId, 'X-Callback-Url': req.notifyUrl },
      body: JSON.stringify({
        amount: String(req.amount), currency: 'XAF', externalId: req.paymentId,
        payer: { partyIdType: 'MSISDN', partyId: req.payerPhone.replace(/[^0-9]/g, '') },
        payerMessage: req.description.slice(0, 160), payeeNote: req.description.slice(0, 160),
      }),
    });
    if (res.status !== 202) throw new Error(`MTN MoMo requesttopay failed (${res.status})`);
    return { providerRef: referenceId, status: 'pending' };
  }

  async status(ref: string): Promise<PaymentStatus> {
    const res = await fetch(`${this.cfg.MTN_MOMO_BASE_URL}/collection/v1_0/requesttopay/${ref}`, { headers: await this.headers() });
    if (!res.ok) throw new Error(`MTN MoMo status failed (${res.status})`);
    const b = (await res.json()) as { status: 'PENDING' | 'SUCCESSFUL' | 'FAILED' };
    return b.status === 'SUCCESSFUL' ? 'succeeded' : b.status === 'FAILED' ? 'failed' : 'pending';
  }
}

/** Stripe Checkout for cards and the diaspora (XAF is a zero-decimal currency in Stripe). */
export class StripeGateway implements PaymentGateway {
  readonly stripe: Stripe;
  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey);
  }

  async checkout(req: CheckoutRequest): Promise<CheckoutResult> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ quantity: 1, price_data: { currency: 'xaf', unit_amount: req.amount, product_data: { name: req.description } } }],
      success_url: req.returnUrl,
      cancel_url: req.cancelUrl,
      client_reference_id: req.paymentId,
      metadata: { paymentId: req.paymentId },
    });
    return { providerRef: session.id, status: 'pending', checkoutUrl: session.url ?? undefined };
  }

  async status(sessionId: string): Promise<PaymentStatus> {
    const s = await this.stripe.checkout.sessions.retrieve(sessionId);
    return s.payment_status === 'paid' ? 'succeeded' : s.status === 'expired' ? 'failed' : 'pending';
  }
}

/**
 * CinetPay (aggregator, cahier des charges p. 25): fallback when Orange Money or MTN is down, and the other Mobile Money
 * operators of the region. The payer chooses their operator on CinetPay's page; our payment id is the transaction_id.
 */
export class CinetPayGateway implements PaymentGateway {
  constructor(private readonly cfg: Config) {}

  private async call<T>(path: string, body: Record<string, unknown>) {
    const res = await fetch(`${this.cfg.CINETPAY_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ apikey: this.cfg.CINETPAY_API_KEY, site_id: this.cfg.CINETPAY_SITE_ID, ...body }),
    });
    const b = (await res.json().catch(() => ({}))) as { code?: string; message?: string; data?: T };
    return { httpOk: res.ok, ...b };
  }

  async checkout(req: CheckoutRequest): Promise<CheckoutResult> {
    const b = await this.call<{ payment_url: string; payment_token: string }>('/v2/payment', {
      transaction_id: req.paymentId,
      amount: req.amount, // XAF amounts must be multiples of 5
      currency: 'XAF',
      description: req.description.replace(/[^\p{L}\p{N} .,'-]/gu, ' ').slice(0, 100),
      notify_url: req.notifyUrl,
      return_url: req.returnUrl,
      channels: 'MOBILE_MONEY',
      lang: 'fr',
    });
    if (b.code !== '201' || !b.data?.payment_url) throw new Error(`CinetPay payment init failed (${b.code ?? 'no code'} ${b.message ?? ''})`);
    return { providerRef: req.paymentId, status: 'pending', checkoutUrl: b.data.payment_url };
  }

  async status(transactionId: string): Promise<PaymentStatus> {
    const b = await this.call<{ status: string }>('/v2/payment/check', { transaction_id: transactionId });
    if (b.code === '00' && b.data?.status === 'ACCEPTED') return 'succeeded';
    if (b.data?.status === 'REFUSED' || b.message === 'PAYMENT_FAILED' || b.message === 'TRANSACTION_CANCEL') return 'failed';
    return 'pending';
  }
}

export function buildGateways(cfg: Config): Record<PaymentMethod, PaymentGateway> {
  const sandbox = new SandboxGateway();
  if (cfg.PAYMENTS_MODE !== 'live') return { orange_money: sandbox, mtn_momo: sandbox, cinetpay: sandbox, stripe: sandbox };
  const unavailable = new UnavailableGateway();
  return {
    orange_money: cfg.ORANGE_MONEY_CLIENT_ID && cfg.ORANGE_MONEY_CLIENT_SECRET && cfg.ORANGE_MONEY_MERCHANT_KEY ? new OrangeMoneyGateway(cfg) : unavailable,
    mtn_momo: cfg.MTN_MOMO_API_USER && cfg.MTN_MOMO_API_KEY && cfg.MTN_MOMO_SUBSCRIPTION_KEY ? new MtnMomoGateway(cfg) : unavailable,
    cinetpay: cfg.CINETPAY_API_KEY && cfg.CINETPAY_SITE_ID ? new CinetPayGateway(cfg) : unavailable,
    stripe: cfg.STRIPE_SECRET_KEY ? new StripeGateway(cfg.STRIPE_SECRET_KEY) : unavailable,
  };
}
