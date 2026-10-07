import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { LEVELS, PLAN_IDS, PLANS, SKILLS } from '@c2pass/shared';
import type pg from 'pg';
import { z } from 'zod';
import { CurrentUser, Public, Roles, type AuthUser } from '../../common/auth.js';
import { badRequest, notFound } from '../../common/errors.js';
import { audit } from '../../infra/audit.js';
import { STORAGE, type Storage } from '../../infra/storage.js';
import { PG } from '../../infra/tokens.js';
import { ContentRepository } from '../content/content.repository.js';
import type { QuestionDoc } from '../content/content.types.js';
import { SimulatorService } from '../simulator/simulator.service.js';

const questionSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{3,64}$/).optional(),
  skill: z.enum(SKILLS),
  level: z.enum(LEVELS),
  type: z.enum(['mcq', 'writing', 'speaking']),
  theme: z.string().max(80).default('Général'),
  statement: z.string().min(3).max(2_000),
  context: z.string().max(10_000).nullable().optional(),
  transcript: z.string().max(10_000).nullable().optional(),
  options: z.array(z.string().min(1).max(500)).length(4).optional(),
  correctAnswer: z.number().int().min(0).max(3).optional(),
  distractors: z.array(z.string().max(500)).max(4).optional(),
  explanation: z.string().max(2_000).optional(),
  task: z.number().int().min(1).max(3).optional(),
  set: z.number().int().min(1).optional(),
  active: z.boolean().default(true),
}).refine((q) => q.type !== 'mcq' || (q.options && q.correctAnswer !== undefined), { message: 'Un QCM exige 4 options et la bonne réponse' })
  .refine((q) => q.type === 'mcq' || q.task !== undefined, { message: 'Une tâche EE/EO exige un numéro de tâche' });

/** Back-office: KPIs (§12), users, anti-fraud, question bank. */
@Controller('admin')
@Roles('admin')
export class AdminController {
  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(ContentRepository) private readonly content: ContentRepository,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  @Get('stats')
  async stats() {
    const one = <T>(sql: string, params: unknown[] = []) => this.pool.query(sql, params).then((r) => r.rows[0] as T);
    const [users, activity, sims, paying, revenue, signups, c2] = await Promise.all([
      one<{ total: number; students: number }>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE role = 'student')::int AS students FROM users WHERE status = 'active'`),
      one<{ dau: number; mau: number }>(`SELECT count(*) FILTER (WHERE last_seen_at > now() - interval '1 day')::int AS dau, count(*) FILTER (WHERE last_seen_at > now() - interval '30 days')::int AS mau FROM users WHERE status = 'active'`),
      one<{ started: number; completed: number }>(`SELECT count(*) FILTER (WHERE status <> 'created')::int AS started, count(*) FILTER (WHERE status = 'completed')::int AS completed FROM exam_sessions WHERE type = 'full'`),
      this.pool.query<{ plan_id: string; n: number }>(`SELECT plan_id, count(*)::int AS n FROM users WHERE status = 'active' AND plan_id <> 'free' AND plan_expires_at > now() GROUP BY plan_id`).then((r) => r.rows),
      one<{ last30: number; total: number }>(`SELECT coalesce(sum(amount) FILTER (WHERE confirmed_at > now() - interval '30 days'), 0)::int AS last30, coalesce(sum(amount), 0)::int AS total FROM payments WHERE status = 'succeeded'`),
      this.pool.query<{ day: string; n: number }>(`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day, count(*)::int AS n FROM users WHERE created_at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`).then((r) => r.rows),
      one<{ reached: number; candidates: number }>(
        `SELECT count(DISTINCT user_id) FILTER (WHERE (scores->'CO'->>'score')::int >= 600 OR (scores->'CE'->>'score')::int >= 600 OR (scores->'EE'->>'score')::int >= 16 OR (scores->'EO'->>'score')::int >= 16)::int AS reached,
                count(DISTINCT user_id)::int AS candidates FROM exam_sessions WHERE status = 'completed'`),
    ]);
    const payingUsers = paying.reduce((a, p) => a + p.n, 0);
    // MRR: monthly plans at list price, the 3-month pack spread over 3 months.
    const mrr = paying.reduce((a, p) => {
      const plan = PLANS[p.plan_id as keyof typeof PLANS];
      if (!plan) return a;
      return a + p.n * (plan.billing === 'one_time' ? Math.round(plan.priceXaf / ((plan.durationDays ?? 30) / 30)) : plan.priceXaf);
    }, 0);
    return {
      users: users.total, students: users.students, dau: activity.dau, mau: activity.mau,
      stickiness: activity.mau ? Math.round((activity.dau / activity.mau) * 100) : 0,
      simulations: { started: sims.started, completed: sims.completed, completionRate: sims.started ? Math.round((sims.completed / sims.started) * 100) : 0 },
      c2Rate: c2.candidates ? Math.round((c2.reached / c2.candidates) * 100) : 0,
      payingUsers, conversionRate: users.students ? Math.round((payingUsers / users.students) * 1000) / 10 : 0,
      byPlan: paying, mrr, arpu: payingUsers ? Math.round(mrr / payingUsers) : 0,
      revenue, signups,
    };
  }

  @Get('users')
  async users(@Query('q') q?: string) {
    const { rows } = await this.pool.query(
      `SELECT u.id, u.email, u.role, u.status, u.plan_id AS "planId", u.plan_expires_at AS "planExpiresAt", u.created_at AS "createdAt", u.last_seen_at AS "lastSeenAt",
              p.first_name AS "firstName", p.last_name AS "lastName", p.country
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id
        WHERE u.status <> 'deleted' AND ($1::text IS NULL OR u.email ILIKE '%' || $1 || '%' OR p.last_name ILIKE '%' || $1 || '%')
        ORDER BY u.created_at DESC LIMIT 100`,
      [q || null],
    );
    return rows;
  }

  @Patch('users/:id')
  async updateUser(@CurrentUser() admin: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = z.object({
      role: z.enum(['student', 'teacher', 'admin']).optional(),
      status: z.enum(['active', 'suspended']).optional(),
      planId: z.enum(PLAN_IDS).optional(),
      planDays: z.number().int().min(1).max(365).optional(),
    }).parse(body);
    const { rowCount } = await this.pool.query(
      `UPDATE users SET role = coalesce($2, role), status = coalesce($3, status), plan_id = coalesce($4, plan_id),
              plan_expires_at = CASE WHEN $4::text IS NULL THEN plan_expires_at WHEN $4 = 'free' THEN NULL ELSE now() + make_interval(days => coalesce($5, 30)) END
        WHERE id = $1 AND status <> 'deleted'`,
      [id, b.role ?? null, b.status ?? null, b.planId ?? null, b.planDays ?? null],
    );
    if (!rowCount) throw notFound('Utilisateur');
    if (b.status === 'suspended') await this.pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
    await audit(this.pool, { userId: id, actorId: admin.id, action: 'admin.user_update', meta: b });
    return { updated: true };
  }

  /** Anti-fraude (§7): browser fingerprints shared by several accounts, and exam-integrity events. */
  @Get('fraud')
  async fraud() {
    const [shared, events] = await Promise.all([
      this.pool.query(
        `SELECT fingerprint, count(DISTINCT user_id)::int AS accounts, array_agg(DISTINCT u.email) AS emails, max(f.created_at) AS "lastSeen"
           FROM fraud_signals f JOIN users u ON u.id = f.user_id
          WHERE fingerprint IS NOT NULL GROUP BY fingerprint HAVING count(DISTINCT user_id) > 1 ORDER BY accounts DESC LIMIT 50`),
      this.pool.query(
        `SELECT u.email, f.event, count(*)::int AS n, max(f.created_at) AS "lastSeen"
           FROM fraud_signals f JOIN users u ON u.id = f.user_id
          WHERE f.event IN ('exam_blur', 'exam_copy', 'exam_paste', 'exam_contextmenu', 'exam_fullscreen_exit') AND f.created_at > now() - interval '30 days'
          GROUP BY u.email, f.event HAVING count(*) >= 3 ORDER BY n DESC LIMIT 50`),
    ]);
    return { sharedFingerprints: shared.rows, examEvents: events.rows };
  }

  // ------------------------------------------------------------ question bank (MongoDB)

  @Get('questions')
  async questions(@Query('skill') skill?: string, @Query('level') level?: string, @Query('q') q?: string) {
    const filter: Record<string, unknown> = {};
    if (skill) filter.skill = z.enum(SKILLS).parse(skill);
    if (level) filter.level = z.enum(LEVELS).parse(level);
    const docs = await this.content.questions.find(filter).sort({ skill: 1, level: 1, _id: 1 }).limit(500).toArray();
    const needle = q?.toLowerCase();
    return (needle ? docs.filter((d) => `${d._id} ${d.statement} ${d.theme}`.toLowerCase().includes(needle)) : docs).map(({ _id, ...d }) => ({ id: _id, ...d }));
  }

  @Get('questions/stats')
  async questionStats() {
    return this.content.countBySkillAndLevel();
  }

  @Post('questions')
  async createQuestion(@Body() body: unknown) {
    const q = questionSchema.parse(body);
    const id = q.id ?? `${q.skill}-${q.level}-${Date.now().toString(36)}`;
    const { id: _ignored, ...rest } = q;
    const doc: QuestionDoc = { _id: id, ...rest, createdAt: new Date(), updatedAt: new Date() };
    await this.content.questions.insertOne(doc);
    return { id, ...rest };
  }

  @Put('questions/:id')
  async updateQuestion(@Param('id') id: string, @Body() body: unknown) {
    const { id: _ignored, ...rest } = questionSchema.parse(body);
    const { matchedCount } = await this.content.questions.updateOne({ _id: id }, { $set: { ...rest, updatedAt: new Date() } });
    if (!matchedCount) throw notFound('Question');
    return { id, ...rest };
  }

  @Delete('questions/:id')
  @HttpCode(204)
  async deleteQuestion(@Param('id') id: string) {
    // Soft delete: past simulations keep referencing it.
    await this.content.questions.updateOne({ _id: id }, { $set: { active: false, updatedAt: new Date() } });
  }

  /** Bulk import (JSON array), used by the pedagogical expert to grow the bank towards 5 000+ items. */
  @Post('questions/import')
  async importQuestions(@Body() body: unknown) {
    const items = z.array(questionSchema).min(1).max(1_000).parse(body);
    const now = new Date();
    const ops = items.map((q, i) => {
      const { id, ...rest } = q;
      const _id = id ?? `${q.skill}-${q.level}-${now.getTime().toString(36)}-${i}`;
      return { updateOne: { filter: { _id }, update: { $set: { ...rest, updatedAt: now }, $setOnInsert: { createdAt: now } }, upsert: true } };
    });
    const r = await this.content.questions.bulkWrite(ops);
    return { inserted: r.upsertedCount, updated: r.modifiedCount };
  }

  /** Attaches a real recording to a CO question (replaces the browser voice). */
  @Post('questions/:id/audio')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadAudio(@Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length || !file.mimetype.startsWith('audio/')) throw badRequest('invalid_audio', 'Fichier audio attendu (MP3, OGG, WAV)');
    const q = await this.content.byId(id);
    if (!q || q.skill !== 'CO') throw notFound('Question CO');
    const key = `questions/${id}`;
    await this.storage.put(key, file.buffer, file.mimetype);
    await this.content.questions.updateOne({ _id: id }, { $set: { audioKey: key, updatedAt: new Date() } });
    return { id, audioKey: key };
  }
}

/** Option correcteur humain (module 2): certified teachers grade Premium Pro submissions. */
@Controller('reviews')
@Roles('teacher', 'admin')
export class ReviewsController {
  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(ContentRepository) private readonly content: ContentRepository,
    @Inject(SimulatorService) private readonly simulator: SimulatorService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  @Get()
  async list(@Query('status') status = 'pending') {
    const { rows } = await this.pool.query(
      `SELECT r.id, r.submission_id AS "submissionId", r.kind, r.status, r.score, r.created_at AS "createdAt", r.done_at AS "doneAt",
              p.first_name AS "firstName", p.last_name AS "lastName"
         FROM human_reviews r LEFT JOIN profiles p ON p.user_id = r.user_id
        WHERE r.status = $1 ORDER BY r.created_at LIMIT 100`,
      [status === 'done' ? 'done' : 'pending'],
    );
    return rows;
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const { rows: [r] } = await this.pool.query(`SELECT id, submission_id AS "submissionId", kind, status, score, comment FROM human_reviews WHERE id = $1`, [z.uuid().parse(id)]);
    if (!r) throw notFound('Correction');
    const sub = r.kind === 'writing' ? await this.content.writings.findOne({ _id: r.submissionId }) : await this.content.audios.findOne({ _id: r.submissionId });
    const question = sub ? await this.content.byId(sub.questionId) : null;
    return {
      ...r,
      question: question ? { statement: question.statement, context: question.context, task: question.task, level: question.level } : null,
      submission: sub ? {
        text: 'text' in sub ? sub.text : null,
        transcription: 'transcription' in sub ? sub.transcription : null,
        audioUrl: 'key' in sub ? `/api/reviews/${r.id}/audio` : null,
        aiScore: sub.aiScore, feedback: sub.feedback, wordCount: 'wordCount' in sub ? sub.wordCount : null,
      } : null,
    };
  }

  @Get(':id/audio')
  async audio(@Param('id') id: string, @Res() res: Response) {
    const { rows: [r] } = await this.pool.query<{ submission_id: string }>(`SELECT submission_id FROM human_reviews WHERE id = $1 AND kind = 'speaking'`, [z.uuid().parse(id)]);
    const audio = r ? await this.content.audios.findOne({ _id: r.submission_id }) : null;
    const file = audio ? await this.storage.get(audio.key) : null;
    if (!file) throw notFound('Enregistrement');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.data);
  }

  @Post(':id')
  async grade(@CurrentUser() teacher: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const b = z.object({ score: z.number().min(0).max(20), comment: z.string().trim().min(10).max(4_000) }).parse(body);
    const { rows: [r] } = await this.pool.query<{ submission_id: string; kind: 'writing' | 'speaking' }>(
      `UPDATE human_reviews SET status = 'done', score = $2, comment = $3, teacher_id = $4, done_at = now() WHERE id = $1 RETURNING submission_id, kind`,
      [z.uuid().parse(id), b.score, b.comment, teacher.id],
    );
    if (!r) throw notFound('Correction');
    const review = { score: Math.round(b.score), comment: b.comment, teacherId: teacher.id, at: new Date() };
    const sub = r.kind === 'writing'
      ? await this.content.writings.findOneAndUpdate({ _id: r.submission_id }, { $set: { humanReview: review } })
      : await this.content.audios.findOneAndUpdate({ _id: r.submission_id }, { $set: { humanReview: review } });
    if (sub?.sessionId) await this.simulator.applyHumanReview(sub.sessionId);
    return { graded: true };
  }
}

/** Landing page pre-registrations (lead generation, §15). */
@Controller('leads')
export class LeadsController {
  constructor(@Inject(PG) private readonly pool: pg.Pool) {}

  @Public()
  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown) {
    const b = z.object({ email: z.email(), country: z.string().max(2).optional(), source: z.string().max(40).optional() }).parse(body);
    await this.pool.query('INSERT INTO leads (email, country, source) VALUES ($1, $2, $3)', [b.email.toLowerCase(), b.country ?? null, b.source ?? 'landing']);
    return { ok: true };
  }
}
