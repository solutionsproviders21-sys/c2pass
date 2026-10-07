import { Body, Controller, Get, Headers, HttpCode, Inject, Logger, Param, Post, Req } from '@nestjs/common';
import { PLAN_IDS, PLANS } from '@c2pass/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { CurrentUser, Public, type AuthUser } from '../../common/auth.js';
import { badRequest, unauthorized } from '../../common/errors.js';
import { CONFIG, type Config } from '../../config.js';
import { BillingService } from './billing.service.js';
import { StripeGateway } from './gateways.js';

@Controller()
export class BillingController {
  private readonly logger = new Logger('Payments');

  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Public()
  @Get('plans')
  plans() {
    return Object.values(PLANS);
  }

  @Post('payments/checkout')
  checkout(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const b = z.object({
      planId: z.enum(PLAN_IDS).refine((p) => p !== 'free'),
      method: z.enum(['orange_money', 'mtn_momo', 'stripe']),
      phone: z.string().regex(/^\+?[0-9 ]{8,20}$/).optional(),
    }).parse(body);
    return this.billing.checkout(user.id, b.planId, b.method, b.phone);
  }

  @Get('payments')
  list(@CurrentUser() user: AuthUser) {
    return this.billing.list(user.id);
  }

  @Get('payments/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.billing.refresh(user.id, id);
  }

  /**
   * POST /payments/webhook/orange-money (§6.1). Orange posts { status, notif_token, txnid };
   * the notif_token returned at checkout authenticates the call.
   */
  @Public()
  @Post('payments/webhook/orange-money')
  @HttpCode(200)
  async orange(@Body() body: unknown) {
    const b = z.object({ status: z.string(), notif_token: z.string(), txnid: z.string().optional() }).passthrough().parse(body);
    const payment = await this.billing.byCallbackToken('orange_money', b.notif_token);
    if (!payment) throw unauthorized('Unknown notification token');
    const status = b.status === 'SUCCESS' ? 'succeeded' : b.status === 'FAILED' || b.status === 'EXPIRED' ? 'failed' : 'pending';
    await this.billing.settle(payment.id, status);
    return { received: true };
  }

  /** MTN MoMo callback: never trusted as is, the status is fetched again from MTN. */
  @Public()
  @Post('payments/webhook/mtn-momo')
  @HttpCode(200)
  async mtn(@Body() body: unknown, @Headers('x-webhook-secret') secret?: string) {
    const b = z.object({ externalId: z.string(), referenceId: z.string().optional(), financialTransactionId: z.string().optional() }).passthrough().parse(body);
    const payment = await this.billing.byId(b.externalId);
    if (!payment?.provider_ref) throw badRequest('unknown_payment', 'Unknown payment');
    const status = this.config.PAYMENTS_MODE === 'live'
      ? await this.billing.gateways.mtn_momo.status(payment.provider_ref)
      : secret === this.config.PAYMENTS_WEBHOOK_SECRET ? ((body as { status?: string }).status === 'FAILED' ? 'failed' : 'succeeded') : 'pending';
    await this.billing.settle(payment.id, status);
    return { received: true };
  }

  /** Stripe webhook, verified with the endpoint signing secret on the raw body. */
  @Public()
  @Post('payments/webhook/stripe')
  @HttpCode(200)
  async stripe(@Req() req: Request & { rawBody?: Buffer }, @Headers('stripe-signature') signature?: string) {
    const gateway = this.billing.gateways.stripe;
    if (!(gateway instanceof StripeGateway) || !this.config.STRIPE_WEBHOOK_SECRET) throw badRequest('stripe_disabled', 'Stripe is not configured');
    if (!signature || !req.rawBody) throw unauthorized('Missing signature');
    const event = gateway.stripe.webhooks.constructEvent(req.rawBody, signature, this.config.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.expired') {
      const session = event.data.object;
      const payment = await this.billing.byProviderRef('stripe', session.id);
      if (payment) await this.billing.settle(payment.id, session.payment_status === 'paid' ? 'succeeded' : 'failed');
    }
    return { received: true };
  }
}
