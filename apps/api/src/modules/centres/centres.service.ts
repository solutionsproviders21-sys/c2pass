import { Inject, Injectable } from '@nestjs/common';
import { opensBooking, type CentreStatus } from '@c2pass/shared';
import type pg from 'pg';
import { notFound } from '../../common/errors.js';
import { JOBS, type Jobs } from '../../infra/jobs.js';
import { PG } from '../../infra/tokens.js';

export interface CentreRow {
  id: string;
  name: string;
  country: string;
  city: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  booking_url: string | null;
  price_xaf: number | null;
  status: CentreStatus;
  next_session_date: string | null;
  seats_left: number | null;
  watch_url: string | null;
  watch_open_pattern: string | null;
  watch_full_pattern: string | null;
  last_checked_at: Date | null;
  last_check_result: string | null;
  updated_at: Date;
}

export function toCentre(r: CentreRow, admin = false) {
  return {
    id: r.id, name: r.name, country: r.country, city: r.city, address: r.address, lat: r.lat, lng: r.lng,
    phone: r.phone, email: r.email, website: r.website, bookingUrl: r.booking_url, priceXaf: r.price_xaf,
    status: r.status, nextSessionDate: r.next_session_date, seatsLeft: r.seats_left, updatedAt: r.updated_at,
    lastCheckedAt: r.last_checked_at,
    ...(admin ? { watchUrl: r.watch_url, watchOpenPattern: r.watch_open_pattern, watchFullPattern: r.watch_full_pattern, lastCheckResult: r.last_check_result } : {}),
  };
}

export interface CentreInput {
  name: string; country: string; city: string; address?: string | null; lat?: number | null; lng?: number | null;
  phone?: string | null; email?: string | null; website?: string | null; bookingUrl?: string | null; priceXaf?: number | null;
  status?: CentreStatus; nextSessionDate?: string | null; seatsLeft?: number | null;
  watchUrl?: string | null; watchOpenPattern?: string | null; watchFullPattern?: string | null;
}

const COLUMNS: [keyof CentreInput, string][] = [
  ['name', 'name'], ['country', 'country'], ['city', 'city'], ['address', 'address'], ['lat', 'lat'], ['lng', 'lng'],
  ['phone', 'phone'], ['email', 'email'], ['website', 'website'], ['bookingUrl', 'booking_url'], ['priceXaf', 'price_xaf'],
  ['nextSessionDate', 'next_session_date'], ['seatsLeft', 'seats_left'],
  ['watchUrl', 'watch_url'], ['watchOpenPattern', 'watch_open_pattern'], ['watchFullPattern', 'watch_full_pattern'],
];

@Injectable()
export class CentresService {
  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(JOBS) private readonly jobs: Jobs,
  ) {}

  async list(filter: { country?: string[]; status?: string[] }) {
    const { rows } = await this.pool.query<CentreRow>(
      `SELECT * FROM exam_centers
        WHERE ($1::text[] IS NULL OR country = ANY($1)) AND ($2::text[] IS NULL OR status = ANY($2))
        ORDER BY country, city, name`,
      [filter.country?.length ? filter.country : null, filter.status?.length ? filter.status : null],
    );
    return rows;
  }

  async get(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Centre');
    const { rows: [r] } = await this.pool.query<CentreRow>('SELECT * FROM exam_centers WHERE id = $1', [id]);
    if (!r) throw notFound('Centre');
    return r;
  }

  async create(input: CentreInput) {
    const cols = COLUMNS.filter(([k]) => input[k] !== undefined);
    const { rows: [r] } = await this.pool.query<CentreRow>(
      `INSERT INTO exam_centers (${cols.map(([, c]) => c).join(', ')}, status) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}, $${cols.length + 1}) RETURNING *`,
      [...cols.map(([k]) => input[k]), input.status ?? 'closed'],
    );
    return r;
  }

  async update(id: string, input: Partial<CentreInput>, actorId: string) {
    const current = await this.get(id);
    const cols = COLUMNS.filter(([k]) => input[k] !== undefined);
    if (cols.length) {
      await this.pool.query(
        `UPDATE exam_centers SET ${cols.map(([, c], i) => `${c} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`,
        [id, ...cols.map(([k]) => input[k])],
      );
    }
    if (input.status && input.status !== current.status) await this.changeStatus(id, input.status, 'admin', actorId);
    return this.get(id);
  }

  async remove(id: string) {
    await this.pool.query('DELETE FROM exam_centers WHERE id = $1', [id]);
  }

  /**
   * Records a status change (from an administrator or the legal watcher) and, when a centre opens
   * its bookings, dispatches alerts to every subscriber.
   */
  async changeStatus(id: string, next: CentreStatus, source: 'admin' | 'watcher', actorId?: string) {
    const { rows: [prev] } = await this.pool.query<{ status: CentreStatus }>(
      `WITH old AS (SELECT status FROM exam_centers WHERE id = $1 FOR UPDATE)
       UPDATE exam_centers c SET status = $2, updated_at = now() FROM old WHERE c.id = $1 RETURNING old.status`,
      [id, next],
    );
    if (!prev || prev.status === next) return;
    await this.pool.query(`INSERT INTO center_status_history (center_id, previous, status, source) VALUES ($1, $2, $3, $4)`, [id, prev.status, next, source]);
    if (actorId) await this.pool.query(`INSERT INTO audit_logs (actor_id, action, meta) VALUES ($1, 'centre.status', $2)`, [actorId, JSON.stringify({ id, from: prev.status, to: next })]);
    if (opensBooking(prev.status, next)) await this.jobs.enqueue('alerts.dispatch', { centreId: id }, { priority: 1 });
  }

  async history(id: string) {
    const { rows } = await this.pool.query(`SELECT previous, status, source, changed_at AS "changedAt" FROM center_status_history WHERE center_id = $1 ORDER BY changed_at DESC LIMIT 50`, [id]);
    return rows;
  }
}
