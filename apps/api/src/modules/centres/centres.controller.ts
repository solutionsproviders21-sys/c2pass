import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ALERT_CHANNELS, CENTRE_STATUSES, COUNTRIES } from '@c2pass/shared';
import { z } from 'zod';
import { CurrentUser, Public, Roles, type AuthUser } from '../../common/auth.js';
import { PUSH, isAllowedPushEndpoint, type PushService } from '../../infra/push.js';
import { AlertsService } from './alerts.service.js';
import { CentresService, toCentre } from './centres.service.js';
import { WatcherService } from './watcher.service.js';

const countryCodes = COUNTRIES.map((c) => c.code) as [string, ...string[]];
const nullableUrl = z.url().nullable().optional();
const centreSchema = z.object({
  name: z.string().trim().min(2).max(160),
  country: z.enum(countryCodes),
  city: z.string().trim().min(1).max(80),
  address: z.string().max(300).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.email().nullable().optional(),
  website: nullableUrl,
  bookingUrl: nullableUrl,
  priceXaf: z.number().int().min(0).nullable().optional(),
  status: z.enum(CENTRE_STATUSES).optional(),
  nextSessionDate: z.iso.date().nullable().optional(),
  seatsLeft: z.number().int().min(0).nullable().optional(),
  watchUrl: nullableUrl,
  watchOpenPattern: z.string().max(300).nullable().optional(),
  watchFullPattern: z.string().max(300).nullable().optional(),
});

const list = (v?: string) => (v ? v.split(',').filter(Boolean) : undefined);

/** Interface de gestion des centres (module 3): public directory, admin maintenance. */
@Controller('centres')
export class CentresController {
  constructor(
    @Inject(CentresService) private readonly centres: CentresService,
    @Inject(WatcherService) private readonly watcher: WatcherService,
  ) {}

  @Public()
  @Get()
  async list(@Query('country') country?: string, @Query('status') status?: string) {
    return (await this.centres.list({ country: list(country), status: list(status) })).map((c) => toCentre(c));
  }

  @Get('admin')
  @Roles('admin')
  async adminList() {
    return (await this.centres.list({})).map((c) => toCentre(c, true));
  }

  @Public()
  @Get(':id')
  async get(@Param('id') id: string) {
    return toCentre(await this.centres.get(id));
  }

  @Post()
  @Roles('admin')
  async create(@Body() body: unknown) {
    return toCentre(await this.centres.create(centreSchema.parse(body)), true);
  }

  @Put(':id')
  @Roles('admin')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    return toCentre(await this.centres.update(id, centreSchema.partial().parse(body), user.id), true);
  }

  /** Quick status update (Ouvert / Fermé / Complet); opening a centre alerts its subscribers. */
  @Patch(':id/status')
  @Roles('admin')
  async status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = z.object({ status: z.enum(CENTRE_STATUSES), nextSessionDate: z.iso.date().nullable().optional(), seatsLeft: z.number().int().min(0).nullable().optional() }).parse(body);
    return toCentre(await this.centres.update(id, b, user.id), true);
  }

  @Get(':id/history')
  @Roles('admin')
  history(@Param('id') id: string) {
    return this.centres.history(id);
  }

  /** Runs the legal watcher on one centre now (respects robots.txt like the scheduled job). */
  @Post(':id/check')
  @Roles('admin')
  @HttpCode(200)
  async check(@Param('id') id: string) {
    const centre = await this.centres.get(id);
    if (!centre.watch_url) return { result: 'no_watch_url' };
    return { result: await this.watcher.check(centre) };
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.centres.remove(id);
  }
}

const channels = z.array(z.enum(ALERT_CHANNELS)).min(1).transform((c) => [...new Set(c)]);
const pushEndpoint = z.string().max(1000).refine(isAllowedPushEndpoint, 'Service de notification non reconnu');
const pushKey = z.string().regex(/^[A-Za-z0-9_-]+=*$/).max(200);

@Controller()
export class AlertsController {
  constructor(
    @Inject(AlertsService) private readonly alerts: AlertsService,
    @Inject(PUSH) private readonly push: PushService,
  ) {}

  /** Public VAPID key the browser needs to subscribe; null while browser push is not configured. */
  @Public()
  @Get('push/key')
  pushKey() {
    return { publicKey: this.push.publicKey };
  }

  @Post('push/subscriptions')
  @HttpCode(204)
  async pushSubscribe(@CurrentUser() user: AuthUser, @Body() body: unknown, @Headers('user-agent') ua?: string) {
    const b = z.object({ endpoint: pushEndpoint, keys: z.object({ p256dh: pushKey, auth: pushKey }) }).parse(body);
    await this.push.subscribe(user.id, b, ua);
  }

  @Post('push/unsubscribe')
  @HttpCode(204)
  async pushUnsubscribe(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const b = z.object({ endpoint: z.string().max(1000) }).parse(body);
    await this.push.unsubscribe(user.id, b.endpoint);
  }

  /** POST /alerts/subscribe — subscription to one exam centre (§6.1). */
  @Post('alerts/subscribe')
  subscribe(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const b = z.object({ centreId: z.uuid(), channels }).parse(body);
    return this.alerts.subscribe(user.id, user.plan, b.centreId, b.channels);
  }

  @Get('alerts/subscriptions')
  list(@CurrentUser() user: AuthUser) {
    return this.alerts.list(user.id);
  }

  @Patch('alerts/subscriptions/:id')
  @HttpCode(204)
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = z.object({ channels: channels.optional(), status: z.enum(['active', 'paused']).optional() }).parse(body);
    await this.alerts.update(user.id, id, b);
  }

  @Delete('alerts/subscriptions/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.alerts.remove(user.id, id);
  }

  @Get('notifications')
  notifications(@CurrentUser() user: AuthUser) {
    return this.alerts.notifications(user.id);
  }

  @Post('notifications/read')
  @HttpCode(204)
  async read(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const b = z.object({ id: z.uuid().optional() }).parse(body ?? {});
    await this.alerts.markRead(user.id, b.id);
  }
}
