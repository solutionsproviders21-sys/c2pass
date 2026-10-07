import { Controller, Get, Inject } from '@nestjs/common';
import { cefrFor, nclcFor, progressToC2, SKILLS, type Skill } from '@c2pass/shared';
import type pg from 'pg';
import { CurrentUser, type AuthUser } from '../../common/auth.js';
import { exercisesToday, simulationsThisMonth } from '../../common/quotas.js';
import { PG } from '../../infra/tokens.js';

const TIPS = [
  'En compréhension orale, lisez les quatre options avant de lancer l’écoute : vous saurez quoi chercher.',
  'Pour la tâche 3 d’expression écrite, annoncez votre position dès l’introduction puis nuancez-la avec « certes… néanmoins ».',
  'Remplacez « il y a beaucoup de problèmes » par « de nombreuses difficultés se posent » : le correcteur C2 valorise la précision.',
  'Entraînez-vous à l’oral avec un minuteur : 4 min 30 passent vite pour défendre un point de vue.',
  'Les questions C1–C2 portent souvent sur le ton : ironie, réserve, regret. Repérez les modalisateurs.',
  'Relisez vos textes en vérifiant les accords du participe passé : c’est l’erreur la plus fréquente à l’écrit.',
  'Le subjonctif après « bien que », « afin que », « pour que » est un marqueur de niveau attendu dès B2.',
];

/** Tableau de bord étudiant: statistics per skill, progression to C2, score history (module 1). */
@Controller('dashboard')
export class DashboardController {
  constructor(@Inject(PG) private readonly pool: pg.Pool) {}

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    const [sessions, practice, profile, unread, usedToday, simsMonth] = await Promise.all([
      this.pool.query<{ id: string; type: string; scores: Record<Skill, { score: number | null; max: number }>; total_score: number | null; completed_at: Date }>(
        `SELECT id, type, scores, total_score, completed_at FROM exam_sessions WHERE user_id = $1 AND status = 'completed' ORDER BY completed_at DESC LIMIT 20`, [user.id]),
      this.pool.query<{ skill: Skill; answered: number; correct: number; last7: number }>(
        `SELECT skill, count(*)::int AS answered, count(*) FILTER (WHERE correct)::int AS correct,
                count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS last7
           FROM practice_attempts WHERE user_id = $1 GROUP BY skill`, [user.id]),
      this.pool.query<{ first_name: string; country: string | null; target_score: string; exam_date: string | null }>(
        `SELECT first_name, country, target_score, exam_date FROM profiles WHERE user_id = $1`, [user.id]),
      this.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL AND channel = 'push'`, [user.id]),
      exercisesToday(this.pool, user.id),
      simulationsThisMonth(this.pool, user.id),
    ]);

    // Latest score per skill, from the most recent completed simulation that graded it.
    const skills = SKILLS.map((skill) => {
      const s = sessions.rows.find((r) => typeof r.scores?.[skill]?.score === 'number');
      const score = s ? s.scores[skill].score! : null;
      const p = practice.rows.find((r) => r.skill === skill);
      return {
        skill,
        score,
        max: skill === 'CO' || skill === 'CE' ? 699 : 20,
        cefr: score === null ? null : cefrFor(skill, score),
        nclc: score === null ? null : nclcFor(skill, score),
        progress: score === null ? 0 : progressToC2(skill, score),
        practice: { answered: p?.answered ?? 0, accuracy: p?.answered ? Math.round((p.correct / p.answered) * 100) : null, last7Days: p?.last7 ?? 0 },
      };
    });
    const graded = skills.filter((s) => s.score !== null);
    const country = profile.rows[0]?.country ?? null;
    const { rows: [nextSession] } = await this.pool.query(
      `SELECT id, name, city, country, status, next_session_date AS "nextSessionDate", seats_left AS "seatsLeft"
         FROM exam_centers WHERE ($1::text IS NULL OR country = $1) AND status IN ('open', 'soon') AND next_session_date >= current_date
        ORDER BY (status = 'open') DESC, next_session_date LIMIT 1`, [country]);
    const { rows: recent } = await this.pool.query(
      `(SELECT 'simulation' AS kind, id::text AS ref, type AS label, total_score AS score, completed_at AS at FROM exam_sessions WHERE user_id = $1 AND status = 'completed')
       UNION ALL
       (SELECT 'exercise', question_id, skill, CASE WHEN correct THEN 1 WHEN correct = false THEN 0 END, created_at FROM practice_attempts WHERE user_id = $1)
       ORDER BY at DESC LIMIT 8`, [user.id]);

    return {
      firstName: profile.rows[0]?.first_name ?? '',
      target: profile.rows[0]?.target_score ?? 'C2',
      examDate: profile.rows[0]?.exam_date ?? null,
      overallProgress: graded.length ? Math.round(graded.reduce((a, s) => a + s.progress, 0) / graded.length) : 0,
      skills,
      history: sessions.rows.slice().reverse().map((s) => ({ id: s.id, type: s.type, totalScore: s.total_score, completedAt: s.completed_at, scores: s.scores })),
      recent,
      nextSession: nextSession ?? null,
      unreadAlerts: unread.rows[0].n,
      quota: {
        plan: user.plan.id,
        exercisesPerDay: user.plan.exercisesPerDay, exercisesToday: usedToday,
        simulationsPerMonth: user.plan.simulationsPerMonth, simulationsThisMonth: simsMonth,
      },
      tip: TIPS[Math.floor(Date.now() / 86_400_000) % TIPS.length],
    };
  }
}
