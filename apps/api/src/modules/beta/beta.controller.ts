import { Body, Controller, Delete, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth.js';
import { BetaService } from './beta.service.js';

/** Back-office: invitation codes of the private beta and the landing page waitlist. */
@Controller('admin')
@Roles('admin')
export class AdminBetaController {
  constructor(@Inject(BetaService) private readonly beta: BetaService) {}

  @Get('invites')
  invites() {
    return this.beta.listInvites();
  }

  @Post('invites')
  create(@CurrentUser() admin: AuthUser, @Body() body: unknown) {
    const b = z.object({
      count: z.number().int().min(1).max(100),
      maxUses: z.number().int().min(1).max(1_000).default(1),
      note: z.string().trim().max(120).optional(),
      expiresInDays: z.number().int().min(1).max(365).optional(),
    }).parse(body);
    return this.beta.createInvites(admin.id, { ...b, note: b.note || undefined });
  }

  @Post('invites/:code/revoke')
  revoke(@CurrentUser() admin: AuthUser, @Param('code') code: string) {
    return this.beta.revoke(admin.id, code);
  }

  @Get('leads')
  leads(@Query('q') q?: string) {
    return this.beta.listLeads(z.string().trim().max(120).optional().parse(q || undefined));
  }

  @Post('leads/invite')
  inviteLeads(@CurrentUser() admin: AuthUser, @Body() body: unknown) {
    const b = z.object({ ids: z.array(z.uuid()).min(1).max(200) }).parse(body);
    return this.beta.inviteLeads(admin.id, b.ids);
  }

  @Delete('leads/:id')
  deleteLead(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    return this.beta.deleteLead(admin.id, z.uuid().parse(id));
  }
}
