import { Body, Controller, Delete, Get, Inject, Param, Post } from '@nestjs/common';
import type pg from 'pg';
import { z } from 'zod';
import { CurrentUser, Roles, type AuthUser } from '../../common/auth.js';
import { notFound } from '../../common/errors.js';
import { audit } from '../../infra/audit.js';
import { PG } from '../../infra/tokens.js';

const CHANNELS = ['facebook_instagram', 'google', 'tiktok', 'influenceurs', 'radio_tv', 'affichage', 'partenariats', 'autre'] as const;

/**
 * Acquisition indicators (cahier des charges p. 24): CAC = marketing spend / new paying customers of the month;
 * LTV = net revenue per paying customer so far. Spend is entered by hand, per month and channel.
 */
@Controller('admin/marketing')
@Roles('admin')
export class MarketingController {
  constructor(@Inject(PG) private readonly pool: pg.Pool) {}

  @Get('spend')
  async spend() {
    const { rows } = await this.pool.query(
      `SELECT id, to_char(month, 'YYYY-MM') AS month, channel, amount_xaf AS "amountXaf", note, created_at AS "createdAt"
         FROM marketing_spend ORDER BY month DESC, created_at DESC LIMIT 500`,
    );
    return rows;
  }

  @Post('spend')
  async addSpend(@CurrentUser() admin: AuthUser, @Body() body: unknown) {
    const b = z.object({
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      channel: z.enum(CHANNELS),
      amountXaf: z.number().int().min(1).max(1_000_000_000),
      note: z.string().trim().max(200).optional(),
    }).parse(body);
    const { rows: [r] } = await this.pool.query<{ id: string }>(
      `INSERT INTO marketing_spend (month, channel, amount_xaf, note, created_by) VALUES (($1 || '-01')::date, $2, $3, $4, $5) RETURNING id`,
      [b.month, b.channel, b.amountXaf, b.note || null, admin.id],
    );
    await audit(this.pool, { actorId: admin.id, action: 'admin.marketing_spend', meta: { month: b.month, channel: b.channel, amountXaf: b.amountXaf } });
    return { id: r.id };
  }

  @Delete('spend/:id')
  async deleteSpend(@CurrentUser() admin: AuthUser, @Param('id') id: string) {
    const { rowCount } = await this.pool.query('DELETE FROM marketing_spend WHERE id = $1', [z.uuid().parse(id)]);
    if (!rowCount) throw notFound('Dépense');
    await audit(this.pool, { actorId: admin.id, action: 'admin.marketing_spend_deleted', meta: { id } });
    return { deleted: true };
  }

  /** The last 12 months, oldest first, and totals over them. */
  @Get('kpis')
  async kpis() {
    const { rows } = await this.pool.query<{ month: string; spend: number; signups: number; new_payers: number; revenue: number }>(
      `WITH months AS (
         SELECT generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month')::date AS month
       ), first_payment AS (
         SELECT user_id, min(confirmed_at) AS at FROM payments WHERE status = 'succeeded' GROUP BY user_id
       )
       SELECT to_char(m.month, 'YYYY-MM') AS month,
              coalesce((SELECT sum(amount_xaf) FROM marketing_spend s WHERE s.month = m.month), 0)::int AS spend,
              (SELECT count(*) FROM users u WHERE u.role = 'student' AND date_trunc('month', u.created_at) = m.month)::int AS signups,
              (SELECT count(*) FROM first_payment f WHERE date_trunc('month', f.at) = m.month)::int AS new_payers,
              coalesce((SELECT sum(amount) FROM payments p WHERE p.status = 'succeeded' AND date_trunc('month', p.confirmed_at) = m.month), 0)::int AS revenue
         FROM months m ORDER BY m.month`,
    );
    const { rows: [life] } = await this.pool.query<{ customers: number; revenue: number }>(
      `SELECT count(DISTINCT user_id)::int AS customers, coalesce(sum(amount), 0)::int AS revenue FROM payments WHERE status = 'succeeded'`,
    );
    const ratio = (a: number, b: number) => (b > 0 ? Math.round(a / b) : null);
    const months = rows.map((r) => ({
      month: r.month, spend: r.spend, signups: r.signups, newPayers: r.new_payers, revenue: r.revenue, cac: ratio(r.spend, r.new_payers),
    }));
    const spend = months.reduce((a, m) => a + m.spend, 0);
    const newPayers = months.reduce((a, m) => a + m.newPayers, 0);
    const cac = ratio(spend, newPayers);
    const ltv = ratio(life.revenue, life.customers);
    return {
      months,
      totals: { spend, newPayers, signups: months.reduce((a, m) => a + m.signups, 0), cac, ltv, ltvToCac: cac && ltv ? Math.round((ltv / cac) * 10) / 10 : null, customers: life.customers },
    };
  }
}
