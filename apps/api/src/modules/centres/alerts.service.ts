import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { effectivePlan, type AlertChannel, type Plan } from '@c2pass/shared';
import type pg from 'pg';
import { badRequest, notFound, upgradeRequired } from '../../common/errors.js';
import { CONFIG, type Config } from '../../config.js';
import { JOBS, type Jobs } from '../../infra/jobs.js';
import { NOTIFIER, type Notifier } from '../../infra/notifier.js';
import { PG } from '../../infra/tokens.js';
import { CentresService } from './centres.service.js';

/** A subscriber is not re-alerted for the same centre within this window. */
const RENOTIFY_HOURS = 6;

interface Recipient {
  alert_id: string;
  user_id: string;
  channels: AlertChannel[];
  email: string;
  phone: string | null;
  whatsapp: string | null;
  first_name: string;
  plan_id: string;
  plan_expires_at: Date | null;
}

/** Système d'alerte temps réel (module 4): subscriptions per centre and multi-channel dispatch. */
@Injectable()
export class AlertsService implements OnModuleInit {
  private readonly logger = new Logger('Alerts');

  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(JOBS) private readonly jobs: Jobs,
    @Inject(NOTIFIER) private readonly notifier: Notifier,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(CentresService) private readonly centres: CentresService,
  ) {}

  onModuleInit() {
    this.jobs.register('alerts.dispatch', (d: { centreId: string }) => this.dispatch(d.centreId));
  }

  async subscribe(userId: string, plan: Plan, centreId: string, channels: AlertChannel[]) {
    if (plan.centreAlerts === 0) throw upgradeRequired('plan_upgrade_required', 'Les alertes de places sont incluses à partir de Premium Standard');
    await this.centres.get(centreId);
    const { rows: [profile] } = await this.pool.query<{ phone: string | null; whatsapp: string | null }>('SELECT phone, whatsapp FROM profiles WHERE user_id = $1', [userId]);
    if (channels.includes('sms') && !profile?.phone) throw badRequest('phone_required', 'Ajoutez un numéro de téléphone à votre profil pour les SMS');
    if (channels.includes('whatsapp') && !(profile?.whatsapp ?? profile?.phone)) throw badRequest('whatsapp_required', 'Ajoutez un numéro WhatsApp à votre profil');
    return this.pool.connect().then(async (c) => {
      try {
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]); // serialise quota checks per user
        const { rows: [{ n }] } = await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM session_alerts WHERE user_id = $1 AND center_id <> $2`, [userId, centreId]);
        if (plan.centreAlerts !== null && n >= plan.centreAlerts) {
          throw upgradeRequired('alert_limit_reached', `Votre offre ${plan.name} permet de surveiller ${plan.centreAlerts} centres`, { limit: plan.centreAlerts });
        }
        const { rows: [a] } = await c.query(
          `INSERT INTO session_alerts (user_id, center_id, channels) VALUES ($1, $2, $3)
           ON CONFLICT (user_id, center_id) DO UPDATE SET channels = EXCLUDED.channels, status = 'active'
           RETURNING id, center_id AS "centreId", channels, status, created_at AS "createdAt"`,
          [userId, centreId, channels],
        );
        await c.query('COMMIT');
        return a;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    });
  }

  async list(userId: string) {
    const { rows } = await this.pool.query(
      `SELECT a.id, a.center_id AS "centreId", a.channels, a.status, a.last_notified_at AS "lastNotifiedAt", a.created_at AS "createdAt",
              c.name AS "centreName", c.city, c.country, c.status AS "centreStatus", c.next_session_date AS "nextSessionDate"
         FROM session_alerts a JOIN exam_centers c ON c.id = a.center_id
        WHERE a.user_id = $1 ORDER BY a.created_at`,
      [userId],
    );
    return rows;
  }

  async update(userId: string, id: string, patch: { channels?: AlertChannel[]; status?: 'active' | 'paused' }) {
    const { rows: [a] } = await this.pool.query(
      `UPDATE session_alerts SET channels = coalesce($3, channels), status = coalesce($4, status) WHERE id = $1 AND user_id = $2 RETURNING id`,
      [id, userId, patch.channels ?? null, patch.status ?? null],
    );
    if (!a) throw notFound('Alerte');
  }

  async remove(userId: string, id: string) {
    await this.pool.query('DELETE FROM session_alerts WHERE id = $1 AND user_id = $2', [id, userId]);
  }

  /** Sends "places available" alerts: priority subscribers (Pro, Pack Réussite) first. */
  async dispatch(centreId: string) {
    const centre = await this.centres.get(centreId);
    if (centre.status !== 'open') return;
    const { rows } = await this.pool.query<Recipient>(
      `SELECT a.id AS alert_id, a.user_id, a.channels, u.email, p.phone, p.whatsapp, coalesce(p.first_name, '') AS first_name, u.plan_id, u.plan_expires_at
         FROM session_alerts a JOIN users u ON u.id = a.user_id LEFT JOIN profiles p ON p.user_id = a.user_id
        WHERE a.center_id = $1 AND a.status = 'active' AND u.status = 'active'
          AND (a.last_notified_at IS NULL OR a.last_notified_at < now() - make_interval(hours => $2))`,
      [centreId, RENOTIFY_HOURS],
    );
    const eligible = rows
      .map((r) => ({ r, plan: effectivePlan(r.plan_id, r.plan_expires_at) }))
      .filter(({ plan }) => plan.centreAlerts !== 0) // lapsed subscriptions stop receiving alerts
      .sort((a, b) => Number(b.plan.priorityAlerts) - Number(a.plan.priorityAlerts));

    const when = centre.next_session_date ? ` pour la session du ${new Date(centre.next_session_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : '';
    const seats = centre.seats_left ? `${centre.seats_left} place(s) disponible(s)` : 'Des places se sont libérées';
    const title = `Alerte C2Pass : places TCF Canada à ${centre.city}`;
    const body = `${seats} à ${centre.name}${when}. Préparez votre dossier pré-rempli et inscrivez-vous sur le site officiel.`;
    const url = `${this.config.PUBLIC_WEB_URL}/alertes/inscription/${centre.id}`;

    for (const { r } of eligible) {
      // The in-app notification ("push") is always created; other channels follow the user's choice.
      for (const channel of new Set<AlertChannel>([...r.channels, 'push'])) {
        const to = channel === 'email' ? r.email : channel === 'sms' ? r.phone : channel === 'whatsapp' ? (r.whatsapp ?? r.phone) : r.user_id;
        let status: 'sent' | 'failed' = 'sent';
        let error: string | null = null;
        try {
          if (!to) throw new Error('missing recipient');
          await this.notifier.send({ channel, to, subject: title, text: `Bonjour ${r.first_name}, ${body}`, url });
        } catch (e) {
          status = 'failed';
          error = e instanceof Error ? e.message : String(e);
          this.logger.warn(`alert ${r.alert_id} via ${channel} failed: ${error}`);
        }
        await this.pool.query(
          `INSERT INTO notifications (user_id, center_id, channel, title, body, url, status, error) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [r.user_id, centreId, channel, title, body, url, status, error],
        );
      }
      await this.pool.query('UPDATE session_alerts SET last_notified_at = now() WHERE id = $1', [r.alert_id]);
    }
    this.logger.log(`Centre ${centre.name}: ${eligible.length} subscriber(s) alerted`);
  }

  async notifications(userId: string) {
    const { rows } = await this.pool.query(
      `SELECT DISTINCT ON (center_id, date_trunc('minute', created_at)) id, center_id AS "centreId", title, body, url, read_at AS "readAt", created_at AS "createdAt"
         FROM notifications WHERE user_id = $1 ORDER BY center_id, date_trunc('minute', created_at) DESC, (channel = 'push') DESC`,
      [userId],
    );
    return rows.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 50);
  }

  async markRead(userId: string, id?: string) {
    // One alert is sent on several channels: reading it marks all of its copies.
    await this.pool.query(
      `UPDATE notifications n SET read_at = now()
        WHERE n.user_id = $1 AND n.read_at IS NULL
          AND ($2::uuid IS NULL OR EXISTS (
            SELECT 1 FROM notifications x WHERE x.id = $2 AND x.user_id = $1
               AND x.center_id IS NOT DISTINCT FROM n.center_id AND date_trunc('minute', x.created_at) = date_trunc('minute', n.created_at)))`,
      [userId, id ?? null],
    );
  }
}
