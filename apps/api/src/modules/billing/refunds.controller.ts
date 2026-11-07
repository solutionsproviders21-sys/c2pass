import { Body, Controller, Get, Inject, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth.js';
import { badRequest } from '../../common/errors.js';
import { PG } from '../../infra/tokens.js';
import { RefundsService } from './refunds.service.js';

const MAX_ATTESTATION_BYTES = 10 * 1024 * 1024;
const ATTESTATION_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** Candidates: refund requests (withdrawal within 7 days, C2 guarantee of the Pack Réussite). */
@Controller()
export class RefundsController {
  constructor(@Inject(RefundsService) private readonly refunds: RefundsService) {}

  @Get('payments/:id/refund')
  eligibility(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.refunds.eligibility(user.id, id);
  }

  @Post('payments/:id/refund')
  @UseInterceptors(FileInterceptor('attestation', { limits: { fileSize: MAX_ATTESTATION_BYTES } }))
  request(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined, @Body() body: unknown) {
    const b = z.object({ kind: z.enum(['withdrawal', 'c2_guarantee']), reason: z.string().trim().max(2_000).optional() }).parse(body);
    if (file && !ATTESTATION_TYPES.includes(file.mimetype)) throw badRequest('invalid_attestation', 'L’attestation doit être un PDF ou une image (JPEG, PNG).');
    return this.refunds.request(user.id, id, b.kind, b.reason || undefined, file?.buffer?.length ? { data: file.buffer, contentType: file.mimetype } : undefined);
  }

  @Get('refunds')
  mine(@CurrentUser() user: AuthUser) {
    return this.refunds.listForUser(user.id);
  }
}

/** Back-office: payments, refunds and the audit log. */
@Controller('admin')
@Roles('admin')
export class AdminBillingController {
  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(RefundsService) private readonly refunds: RefundsService,
  ) {}

  @Get('payments')
  async payments(@Query() query: unknown) {
    const q = z.object({ q: z.string().trim().max(120).optional(), status: z.enum(['pending', 'succeeded', 'failed', 'refunded']).optional() }).parse(query);
    const { rows } = await this.pool.query(
      `SELECT p.id, p.plan_id AS "planId", p.amount, p.currency, p.method, p.status, p.provider_ref AS "providerRef",
              p.created_at AS "createdAt", p.confirmed_at AS "confirmedAt", u.id AS "userId", u.email
         FROM payments p JOIN users u ON u.id = p.user_id
        WHERE ($1::text IS NULL OR u.email ILIKE '%' || $1 || '%' OR p.provider_ref = $1 OR p.id::text = $1)
          AND ($2::text IS NULL OR p.status = $2)
        ORDER BY p.created_at DESC LIMIT 200`,
      [q.q || null, q.status ?? null],
    );
    return rows;
  }

  @Post('payments/:id/refund')
  refund(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = z.object({ note: z.string().trim().max(1_000).optional() }).parse(body ?? {});
    return this.refunds.refundByAdmin(admin.id, id, b.note || undefined);
  }

  @Get('refunds')
  list(@Query('status') status?: string) {
    return this.refunds.listForAdmin(z.enum(['pending', 'approved', 'rejected']).optional().parse(status || undefined));
  }

  @Get('refunds/:id/attestation')
  async attestation(@Param('id') id: string, @Res() res: Response) {
    const file = await this.refunds.attestation(id);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', 'attachment; filename="attestation"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.data);
  }

  @Post('refunds/:id/decision')
  decide(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = z.object({ approve: z.boolean(), note: z.string().trim().max(1_000).optional() })
      .refine((x) => x.approve || !!x.note, { message: 'Indiquez le motif du refus', path: ['note'] }).parse(body);
    return this.refunds.decide(admin.id, id, b.approve, b.note || undefined);
  }

  @Get('audit')
  async audit(@Query() query: unknown) {
    // action: one or more comma-separated prefixes, e.g. "vault." or "account.,password.,totp."
    const q = z.object({ q: z.string().trim().max(120).optional(), action: z.string().trim().max(200).optional() }).parse(query);
    const prefixes = q.action ? q.action.split(',').map((p) => `${p.trim().replace(/[%_\\]/g, '\\$&')}%`).filter((p) => p.length > 1) : null;
    const { rows } = await this.pool.query(
      `SELECT a.id, a.action, a.meta, a.created_at AS "createdAt", host(a.ip) AS ip, u.email AS "userEmail", actor.email AS "actorEmail"
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN users actor ON actor.id = a.actor_id
        WHERE ($1::text IS NULL OR u.email ILIKE '%' || $1 || '%' OR actor.email ILIKE '%' || $1 || '%')
          AND ($2::text[] IS NULL OR a.action LIKE ANY($2))
        ORDER BY a.created_at DESC LIMIT 300`,
      [q.q || null, prefixes],
    );
    return rows;
  }
}
