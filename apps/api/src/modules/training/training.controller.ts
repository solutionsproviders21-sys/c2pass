import { Body, Controller, Get, Inject, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { EE_TASKS, LEVELS, SKILLS, type Skill } from '@c2pass/shared';
import type { Response } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { CurrentUser, type AuthUser } from '../../common/auth.js';
import { badRequest, conflict, notFound, upgradeRequired } from '../../common/errors.js';
import { assertExerciseQuota, exercisesToday } from '../../common/quotas.js';
import { STORAGE, type Storage } from '../../infra/storage.js';
import { PG } from '../../infra/tokens.js';
import { ContentRepository } from '../content/content.repository.js';
import { publicQuestion } from '../content/content.types.js';
import { EvaluationService } from '../evaluation/evaluation.service.js';

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

/** Mode entraînement thématique (module 1.B): practice by skill, with immediate correction. */
@Controller()
export class TrainingController {
  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(ContentRepository) private readonly content: ContentRepository,
    @Inject(EvaluationService) private readonly evaluation: EvaluationService,
    @Inject(STORAGE) private readonly storage: Storage,
  ) {}

  @Get('training/overview')
  async overview(@CurrentUser() user: AuthUser) {
    const [counts, used, stats] = await Promise.all([
      this.content.countBySkillAndLevel(),
      exercisesToday(this.pool, user.id),
      this.pool.query<{ skill: Skill; answered: number; correct: number }>(
        `SELECT skill, count(*)::int AS answered, count(*) FILTER (WHERE correct)::int AS correct
           FROM practice_attempts WHERE user_id = $1 GROUP BY skill`,
        [user.id],
      ),
    ]);
    return {
      quota: { perDay: user.plan.exercisesPerDay, usedToday: used },
      skills: SKILLS.map((skill) => ({
        skill,
        questions: Object.fromEntries(LEVELS.map((l) => [l, counts.find((c) => c._id.skill === skill && c._id.level === l)?.n ?? 0])),
        answered: stats.rows.find((s) => s.skill === skill)?.answered ?? 0,
        correct: stats.rows.find((s) => s.skill === skill)?.correct ?? 0,
      })),
    };
  }

  @Get('training/:skill/question')
  async next(@CurrentUser() user: AuthUser, @Param('skill') skillParam: string, @Query('level') level?: string) {
    const skill = z.enum(SKILLS).parse(skillParam);
    const lvl = level ? z.enum(LEVELS).parse(level) : undefined;
    await assertExerciseQuota(this.pool, user.id, user.plan);
    const { rows } = await this.pool.query<{ question_id: string }>(
      `SELECT question_id FROM practice_attempts WHERE user_id = $1 AND skill = $2 ORDER BY created_at DESC LIMIT 200`,
      [user.id, skill],
    );
    const [q] = await this.content.sample({ skill, level: lvl }, 1, rows.map((r) => r.question_id));
    if (!q) throw notFound('Question');
    return publicQuestion(q);
  }

  /** Listening in training mode: replays are allowed (unlike the exam simulator). */
  @Get('training/audio/:questionId')
  async audio(@CurrentUser() user: AuthUser, @Param('questionId') id: string, @Res() res: Response) {
    const q = await this.content.byId(id);
    if (!q || q.skill !== 'CO') throw notFound('Audio');
    await this.assertNotInExam(user.id, id);
    if (q.audioKey) {
      const file = await this.storage.get(q.audioKey);
      if (file) {
        res.setHeader('Content-Type', file.contentType);
        res.setHeader('Cache-Control', 'private, no-store');
        res.send(file.data);
        return;
      }
    }
    res.json({ tts: q.transcript ?? q.context ?? '' });
  }

  @Post('training/answer')
  async answer(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const b = z.object({ questionId: z.string().min(1), choice: z.number().int().min(0).max(3) }).parse(body);
    const q = await this.content.byId(b.questionId);
    if (!q || q.type !== 'mcq') throw notFound('Question');
    await this.assertNotInExam(user.id, q._id);
    await assertExerciseQuota(this.pool, user.id, user.plan);
    const correct = q.correctAnswer === b.choice;
    await this.pool.query(
      `INSERT INTO practice_attempts (user_id, skill, question_id, level, correct) VALUES ($1, $2, $3, $4, $5)`,
      [user.id, q.skill, q._id, q.level, correct],
    );
    return {
      correct,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation ?? null,
      whyWrong: correct ? null : (q.distractors?.[b.choice] || null),
      transcript: q.skill === 'CO' ? (q.transcript ?? q.context ?? null) : null,
    };
  }

  /** Training must not become a way to get the answer or replay the audio of a question in a running simulation. */
  private async assertNotInExam(userId: string, questionId: string) {
    const { rowCount } = await this.pool.query(
      `SELECT 1 FROM exam_sessions s WHERE s.user_id = $1 AND s.status IN ('created', 'in_progress')
          AND EXISTS (SELECT 1 FROM jsonb_each(s.items) e WHERE e.value ? $2) LIMIT 1`,
      [userId, questionId],
    );
    if (rowCount) throw conflict('question_in_exam', 'Cette question fait partie de votre simulation en cours.');
  }

  @Post('training/writing')
  async writing(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const b = z.object({ questionId: z.string(), text: z.string().trim().min(1).max(8_000), humanReview: z.boolean().optional() }).parse(body);
    const q = await this.content.byId(b.questionId);
    if (!q || q.skill !== 'EE') throw notFound('Sujet');
    await assertExerciseQuota(this.pool, user.id, user.plan);
    if (b.humanReview && !user.plan.humanCorrection) throw upgradeRequired('plan_upgrade_required', 'La correction humaine est incluse dans Premium Pro');
    const sub = await this.evaluation.submitWriting({
      userId: user.id, sessionId: null, questionId: q._id, task: q.task ?? 3, text: b.text,
      tier: user.plan.ai, humanReview: !!b.humanReview, evaluate: true,
    });
    await this.pool.query(`INSERT INTO practice_attempts (user_id, skill, question_id, level) VALUES ($1, 'EE', $2, $3)`, [user.id, q._id, q.level]);
    return this.submission(user, sub._id);
  }

  @Post('training/speaking')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_BYTES } }))
  async speaking(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined, @Body() body: Record<string, string>) {
    const b = z.object({ questionId: z.string(), duration: z.coerce.number().optional(), humanReview: z.enum(['true', 'false']).optional() }).parse(body);
    if (!file?.buffer?.length) throw badRequest('audio_required', 'Enregistrement audio manquant');
    if (!file.mimetype.startsWith('audio/') && file.mimetype !== 'video/webm') throw badRequest('invalid_audio', 'Format audio non pris en charge');
    const q = await this.content.byId(b.questionId);
    if (!q || q.skill !== 'EO') throw notFound('Sujet');
    await assertExerciseQuota(this.pool, user.id, user.plan);
    const humanReview = b.humanReview === 'true';
    if (humanReview && !user.plan.humanCorrection) throw upgradeRequired('plan_upgrade_required', 'La correction humaine est incluse dans Premium Pro');
    const doc = await this.evaluation.submitSpeaking({
      userId: user.id, sessionId: null, questionId: q._id, task: q.task ?? 1, audio: file.buffer, contentType: file.mimetype,
      duration: b.duration ?? null, tier: user.plan.ai, humanReview,
    });
    await this.pool.query(`INSERT INTO practice_attempts (user_id, skill, question_id, level) VALUES ($1, 'EO', $2, $3)`, [user.id, q._id, q.level]);
    return this.recording(user, doc._id);
  }

  @Get('training/submissions/:id')
  async submission(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const s = await this.content.writings.findOne({ _id: id, userId: user.id });
    if (!s) throw notFound('Copie');
    const bounds = EE_TASKS[(s.task || 3) - 1];
    return { id: s._id, kind: 'writing', status: s.status, task: s.task, text: s.text, wordCount: s.wordCount, bounds, metrics: s.metrics, score: s.aiScore, feedback: s.feedback, humanReview: s.humanReview ?? null, createdAt: s.createdAt };
  }

  @Get('training/recordings/:id')
  async recording(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const a = await this.content.audios.findOne({ _id: id, userId: user.id });
    if (!a) throw notFound('Enregistrement');
    return { id: a._id, kind: 'speaking', status: a.status, task: a.task, transcription: a.transcription, score: a.aiScore, feedback: a.feedback, humanReview: a.humanReview ?? null, createdAt: a.createdAt };
  }

  @Get('training/history')
  async history(@CurrentUser() user: AuthUser) {
    const [writings, audios] = await Promise.all([
      this.content.writings.find({ userId: user.id, sessionId: null }).sort({ createdAt: -1 }).limit(20).toArray(),
      this.content.audios.find({ userId: user.id, sessionId: null }).sort({ createdAt: -1 }).limit(20).toArray(),
    ]);
    return {
      writings: writings.map((w) => ({ id: w._id, task: w.task, status: w.status, score: w.aiScore, wordCount: w.wordCount, createdAt: w.createdAt })),
      recordings: audios.map((a) => ({ id: a._id, task: a.task, status: a.status, score: a.aiScore, createdAt: a.createdAt })),
    };
  }

  @Get('courses')
  async courses() {
    const docs = await this.content.courses.find({}, { projection: { sections: 0, lexicon: 0 } }).sort({ order: 1 }).toArray();
    return docs.map((c) => ({ id: c._id, skill: c.skill, level: c.level, title: c.title, summary: c.summary }));
  }

  @Get('courses/:id')
  async course(@Param('id') id: string) {
    const c = await this.content.courses.findOne({ _id: id });
    if (!c) throw notFound('Fiche');
    return { id: c._id, skill: c.skill, level: c.level, title: c.title, summary: c.summary, sections: c.sections, lexicon: c.lexicon ?? [] };
  }
}
