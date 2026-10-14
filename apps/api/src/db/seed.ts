import 'reflect-metadata';
import { cefrFor, nclcFor, progressToC2, type Skill } from '@c2pass/shared';
import argon2 from 'argon2';
import { fileURLToPath } from 'node:url';
import { MongoClient, type Db } from 'mongodb';
import type pg from 'pg';
import { loadConfig } from '../config.js';
import { createPool } from '../infra/database.js';
import type { CourseDoc, QuestionDoc } from '../modules/content/content.types.js';
import { migrate } from './migrate.js';
import { CE } from './seed-data/ce.js';
import { CENTRES } from './seed-data/centres.js';
import { CO } from './seed-data/co.js';
import { COURSES } from './seed-data/courses.js';
import { TASKS } from './seed-data/tasks.js';

export const DEMO_PASSWORD = 'Demo1234!';

export async function seedContent(db: Db) {
  const now = new Date();
  const questions: QuestionDoc[] = [];
  for (const [skill, bank] of [['CE', CE], ['CO', CO]] as const) {
    const perLevel = new Map<string, number>();
    for (const q of bank) {
      const n = (perLevel.get(q.level) ?? 0) + 1;
      perLevel.set(q.level, n);
      questions.push({
        _id: `${skill}-${q.level}-${String(n).padStart(2, '0')}`,
        skill, level: q.level, type: 'mcq', theme: q.theme, statement: q.statement,
        context: skill === 'CE' ? q.context : null,
        transcript: skill === 'CO' ? q.context : null,
        options: [...q.options], correctAnswer: q.answer, explanation: q.explanation,
        distractors: q.options.map((_, i) => (i === q.answer ? '' : 'Cette option ne correspond pas à ce que dit le document : relisez la justification.')),
        active: true, createdAt: now, updatedAt: now,
      });
    }
  }
  for (const t of TASKS) {
    questions.push({
      _id: `${t.skill}-S${t.set}-T${t.task}`,
      skill: t.skill, level: t.level, type: t.skill === 'EE' ? 'writing' : 'speaking', theme: t.theme,
      statement: t.statement, context: t.context ?? null, task: t.task, set: t.set,
      active: true, createdAt: now, updatedAt: now,
    });
  }
  for (const q of questions) {
    // Keep uploaded recordings (audioKey) when re-seeding.
    const { _id, createdAt, ...rest } = q;
    await db.collection<QuestionDoc>('questions').updateOne({ _id }, { $set: rest, $setOnInsert: { createdAt } }, { upsert: true });
  }
  const courses: CourseDoc[] = COURSES.map((c, i) => ({ _id: c.slug, skill: c.skill, level: c.level, title: c.title, summary: c.summary, sections: c.sections, lexicon: c.lexicon, order: i }));
  for (const c of courses) await db.collection<CourseDoc>('courses').replaceOne({ _id: c._id }, c, { upsert: true });
  return { questions: questions.length, courses: courses.length };
}

async function upsertUser(pool: pg.Pool, u: { email: string; role: string; plan: string; firstName: string; lastName: string; country: string; city: string; phone?: string }) {
  const hash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  const { rows: [row] } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, plan_id, plan_expires_at, email_verified_at) VALUES ($1, $2, $3, $4, CASE WHEN $4 = 'free' THEN NULL ELSE now() + interval '30 days' END, now())
     ON CONFLICT (lower(email)) WHERE status <> 'deleted' DO UPDATE SET role = EXCLUDED.role, plan_id = EXCLUDED.plan_id, plan_expires_at = EXCLUDED.plan_expires_at,
       email_verified_at = coalesce(users.email_verified_at, now())
     RETURNING id`,
    [u.email, hash, u.role, u.plan],
  );
  await pool.query(
    `INSERT INTO profiles (user_id, first_name, last_name, country, city, phone, whatsapp, terms_accepted_at) VALUES ($1, $2, $3, $4, $5, $6, $6, now())
     ON CONFLICT (user_id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, country = EXCLUDED.country, city = EXCLUDED.city, phone = EXCLUDED.phone, whatsapp = EXCLUDED.whatsapp`,
    [row.id, u.firstName, u.lastName, u.country, u.city, u.phone ?? null],
  );
  return row.id;
}

/** Questions, fiches and centres; plus the demo accounts (known password) unless `demoAccounts` is false. */
export async function seed(pool: pg.Pool, db: Db, { demoAccounts = true } = {}) {
  await migrate(pool);
  const content = await seedContent(db);

  const { rows: [{ n }] } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM exam_centers');
  if (n === 0) {
    for (const c of CENTRES) {
      await pool.query(
        `INSERT INTO exam_centers (name, country, city, lat, lng, status, next_session_date, seats_left)
         VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7::int IS NULL THEN NULL ELSE current_date + $7::int END, $8)`,
        [c.name, c.country, c.city, c.lat, c.lng, c.status, c.nextSessionInDays, c.seatsLeft],
      );
    }
  }

  if (!demoAccounts) return { ...content, centres: CENTRES.length, users: null };

  const student = await upsertUser(pool, { email: 'etudiant@c2pass.cm', role: 'student', plan: 'free', firstName: 'Marie', lastName: 'Ngono', country: 'CM', city: 'Yaoundé', phone: '+237 690 00 00 01' });
  const premium = await upsertUser(pool, { email: 'premium@c2pass.cm', role: 'student', plan: 'pro', firstName: 'Jean', lastName: 'Mba', country: 'GA', city: 'Libreville', phone: '+241 77 00 00 02' });
  await upsertUser(pool, { email: 'correcteur@c2pass.cm', role: 'teacher', plan: 'free', firstName: 'Aïcha', lastName: 'Bello', country: 'CM', city: 'Douala' });
  await upsertUser(pool, { email: 'admin@c2pass.cm', role: 'admin', plan: 'free', firstName: 'Admin', lastName: 'C2Pass', country: 'CM', city: 'Yaoundé' });

  // A short history of completed mock exams so the premium dashboard shows a progression.
  const { rows: [{ has }] } = await pool.query<{ has: boolean }>('SELECT exists(SELECT 1 FROM exam_sessions WHERE user_id = $1) AS has', [premium]);
  if (!has) {
    const history: Record<Skill, number>[] = [
      { CO: 468, CE: 497, EE: 11, EO: 12 },
      { CO: 512, CE: 548, EE: 13, EO: 13 },
      { CO: 571, CE: 612, EE: 15, EO: 14 },
    ];
    for (const [i, h] of history.entries()) {
      const scores = Object.fromEntries((Object.entries(h) as [Skill, number][]).map(([k, v]) => [k, { score: v, max: k === 'CO' || k === 'CE' ? 699 : 20, cefr: cefrFor(k, v), nclc: nclcFor(k, v), progress: progressToC2(k, v) }]));
      const total = Math.round((Object.entries(h) as [Skill, number][]).reduce((a, [k, v]) => a + progressToC2(k, v), 0) / 4);
      await pool.query(
        `INSERT INTO exam_sessions (user_id, type, skills, status, items, section_index, started_at, completed_at, scores, total_score, created_at)
         VALUES ($1, 'full', '{CO,CE,EE,EO}', 'completed', '{"CO":[],"CE":[],"EE":[],"EO":[]}', 4,
                 now() - make_interval(days => $2) - interval '3 hours', now() - make_interval(days => $2), $3, $4, now() - make_interval(days => $2) - interval '3 hours')`,
        [premium, (history.length - i) * 9, JSON.stringify(scores), total],
      );
    }
    const yaounde = await pool.query<{ id: string }>(`SELECT id FROM exam_centers WHERE city = 'Yaoundé' LIMIT 1`);
    const libreville = await pool.query<{ id: string }>(`SELECT id FROM exam_centers WHERE city = 'Libreville' LIMIT 1`);
    for (const c of [...yaounde.rows, ...libreville.rows]) {
      await pool.query(`INSERT INTO session_alerts (user_id, center_id, channels) VALUES ($1, $2, '{email,sms,whatsapp,push}') ON CONFLICT DO NOTHING`, [premium, c.id]);
    }
  }
  return { ...content, centres: CENTRES.length, users: { student, premium } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cfg = loadConfig();
  const pool = createPool(cfg.DATABASE_URL);
  const client = await new MongoClient(cfg.MONGO_URL).connect();
  try {
    // Demo accounts share a published password: never on a production server unless explicitly asked.
    const demoAccounts = cfg.NODE_ENV !== 'production' || process.env.SEED_DEMO_ACCOUNTS === 'true';
    const r = await seed(pool, client.db(cfg.MONGO_DB), { demoAccounts });
    console.log(`Seed OK: ${r.questions} questions, ${r.courses} fiches, ${r.centres} centres.`);
    if (!demoAccounts) console.log('Production : aucun compte de démonstration créé. Créez l’administrateur avec : node dist/db/create-admin.js <email> <prénom> <nom>');
    else console.log(`Comptes de démonstration (mot de passe ${DEMO_PASSWORD}) : etudiant@c2pass.cm (Gratuit), premium@c2pass.cm (Premium Pro), correcteur@c2pass.cm (correcteur), admin@c2pass.cm (admin, TOTP à configurer à la 1re connexion).`);
  } finally {
    await pool.end();
    await client.close();
  }
}
