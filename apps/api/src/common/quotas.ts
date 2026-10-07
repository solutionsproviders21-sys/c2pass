import type { Plan } from '@c2pass/shared';
import type { Queryable } from '../infra/database.js';
import { upgradeRequired } from './errors.js';

/** Thematic exercises answered today (Africa/Douala, UTC+1). */
export async function exercisesToday(db: Queryable, userId: string): Promise<number> {
  const { rows: [r] } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM practice_attempts
      WHERE user_id = $1 AND created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Douala') AT TIME ZONE 'Africa/Douala'`,
    [userId],
  );
  return r.n;
}

export async function assertExerciseQuota(db: Queryable, userId: string, plan: Plan) {
  if (plan.exercisesPerDay === null) return;
  const used = await exercisesToday(db, userId);
  if (used >= plan.exercisesPerDay) {
    throw upgradeRequired('daily_limit_reached', `Limite de ${plan.exercisesPerDay} exercices par jour atteinte avec l’offre ${plan.name}`, { limit: plan.exercisesPerDay, used });
  }
}

export async function simulationsThisMonth(db: Queryable, userId: string): Promise<number> {
  const { rows: [r] } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM exam_sessions
      WHERE user_id = $1 AND type = 'full' AND created_at >= date_trunc('month', now() AT TIME ZONE 'Africa/Douala') AT TIME ZONE 'Africa/Douala'`,
    [userId],
  );
  return r.n;
}
