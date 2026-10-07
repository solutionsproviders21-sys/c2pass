import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  cefrFor, effectivePlan, EXAM_SECTIONS, LEVELS, nclcFor, progressToC2, scaledMcqScore, sectionOf, SKILLS,
  type Level, type Plan, type Skill,
} from '@c2pass/shared';
import type pg from 'pg';
import { AppError, badRequest, conflict, notFound, upgradeRequired } from '../../common/errors.js';
import { simulationsThisMonth } from '../../common/quotas.js';
import { randomToken } from '../../infra/crypto.js';
import { withTransaction } from '../../infra/database.js';
import { PG } from '../../infra/tokens.js';
import { ContentRepository } from '../content/content.repository.js';
import { publicQuestion, type QuestionDoc } from '../content/content.types.js';
import { EvaluationService } from '../evaluation/evaluation.service.js';

/** Seconds of tolerance after a deadline for requests already in flight. */
const GRACE_SECONDS = 5;

/** Official-like difficulty mix for a 39-item MCQ section (easy items first). */
const MCQ_MIX: Record<Level, number> = { A1: 4, A2: 6, B1: 9, B2: 9, C1: 6, C2: 5 };

export interface SessionRow {
  id: string;
  user_id: string;
  type: 'full' | 'section';
  skills: Skill[];
  status: 'created' | 'in_progress' | 'evaluating' | 'completed' | 'abandoned';
  items: Record<Skill, string[]>;
  section_index: number;
  section_started_at: Date | null;
  section_deadline: Date | null;
  started_at: Date | null;
  completed_at: Date | null;
  scores: Partial<Record<Skill, SkillScore>>;
  total_score: number | null;
  created_at: Date;
}

export interface SkillScore {
  score: number | null;
  max: number;
  cefr: string | null;
  nclc: number | null;
  progress: number | null;
  /** True while a teacher still has to grade (speaking without speech recognition). */
  pending?: boolean;
}

@Injectable()
export class SimulatorService implements OnModuleInit {
  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(ContentRepository) private readonly content: ContentRepository,
    @Inject(EvaluationService) private readonly evaluation: EvaluationService,
  ) {}

  onModuleInit() {
    this.evaluation.onEvaluated(async (e) => {
      if (e.sessionId) await this.tryFinalize(e.sessionId);
    });
  }

  // ---------------------------------------------------------------- lifecycle

  async create(userId: string, plan: Plan, input: { type: 'full' | 'section'; skill?: Skill }): Promise<SessionRow> {
    if (input.type === 'full' && plan.simulationsPerMonth !== null) {
      const used = await simulationsThisMonth(this.pool, userId);
      if (used >= plan.simulationsPerMonth) {
        throw upgradeRequired('monthly_simulations_reached', `Vous avez utilisé vos ${plan.simulationsPerMonth} simulation(s) du mois avec l’offre ${plan.name}`, { limit: plan.simulationsPerMonth, used });
      }
    }
    if (input.type === 'section' && !input.skill) throw badRequest('skill_required', 'Choisissez l’épreuve à simuler');
    const skills: Skill[] = input.type === 'full' ? EXAM_SECTIONS.map((s) => s.skill) : [input.skill!];

    // Avoid serving questions the candidate saw in recent simulations.
    const { rows: recent } = await this.pool.query<{ items: Record<Skill, string[]> }>(
      `SELECT items FROM exam_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`,
      [userId],
    );
    const seen = recent.flatMap((r) => Object.values(r.items).flat());
    const items = {} as Record<Skill, string[]>;
    for (const skill of skills) items[skill] = await this.pickItems(skill, seen);
    for (const skill of skills) if (!items[skill].length) throw new AppError(503, 'question_bank_empty', `La banque de questions ${skill} est vide`);

    const { rows: [row] } = await this.pool.query<SessionRow>(
      `INSERT INTO exam_sessions (user_id, type, skills, items) VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, input.type, skills, JSON.stringify(items)],
    );
    return row;
  }

  /** POST /simulator/sessions/:id/start — starts the clock of the first section and locks the session. */
  async start(userId: string, id: string, signal: { fingerprint?: string; ip: string | null }) {
    const session = await this.own(userId, id);
    if (session.status !== 'created') throw conflict('already_started', 'Cette simulation a déjà commencé');
    const first = sectionOf(session.skills[0]);
    await this.pool.query(
      `UPDATE exam_sessions SET status = 'in_progress', started_at = now(), section_index = 0, section_started_at = now(),
              section_deadline = now() + make_interval(mins => $2), fingerprint = $3, ip = $4
        WHERE id = $1`,
      [id, first.minutes, signal.fingerprint ?? null, signal.ip],
    );
    await this.pool.query(`INSERT INTO fraud_signals (user_id, fingerprint, ip, event) VALUES ($1, $2, $3, 'exam_start')`, [userId, signal.fingerprint ?? null, signal.ip]);
    return this.state(userId, id);
  }

  /** Current state of a session; expired sections are closed lazily here. */
  async state(userId: string, id: string) {
    let session = await this.own(userId, id);
    if (session.status === 'in_progress' && this.expired(session)) {
      await this.advance(userId, id, session.section_index);
      session = await this.own(userId, id);
    }
    const base = {
      id: session.id,
      type: session.type,
      status: session.status,
      sections: session.skills.map((skill, i) => ({
        skill, items: session.items[skill].length, minutes: sectionOf(skill).minutes,
        state: session.status === 'created' ? 'locked' : i < session.section_index || session.status !== 'in_progress' ? 'done' : i === session.section_index ? 'current' : 'locked',
      })),
      startedAt: session.started_at,
      completedAt: session.completed_at,
    };
    if (session.status !== 'in_progress') return { ...base, current: null };

    const skill = session.skills[session.section_index];
    const ids = session.items[skill];
    const questions = await this.content.byIds(ids);
    const answers = await this.pool.query<{ question_id: string; choice: number }>(`SELECT question_id, choice FROM exam_answers WHERE session_id = $1 AND skill = $2`, [id, skill]);
    const plays = await this.pool.query<{ question_id: string }>(`SELECT question_id FROM audio_plays WHERE session_id = $1`, [id]);
    const drafts = skill === 'EE' ? await this.content.writings.find({ sessionId: id }).toArray() : [];
    const recordings = skill === 'EO' ? await this.content.audios.find({ sessionId: id }).toArray() : [];
    return {
      ...base,
      current: {
        skill,
        index: session.section_index,
        deadline: session.section_deadline,
        remainingSeconds: Math.max(0, Math.floor((session.section_deadline!.getTime() - Date.now()) / 1000)),
        questions: ids.map((qid) => questions.get(qid)).filter((q): q is QuestionDoc => !!q).map((q) => ({
          ...publicQuestion(q),
          answered: answers.rows.find((a) => a.question_id === q._id)?.choice ?? null,
          played: plays.rows.some((p) => p.question_id === q._id),
          draft: drafts.find((d) => d.questionId === q._id)?.text ?? null,
          recorded: recordings.some((r) => r.questionId === q._id),
        })),
      },
    };
  }

  async answer(userId: string, id: string, questionId: string, choice: number) {
    const { session, skill } = await this.currentSection(userId, id, ['CO', 'CE']);
    if (!session.items[skill].includes(questionId)) throw badRequest('not_in_section', 'Question hors de la section en cours');
    const q = await this.content.byId(questionId);
    if (!q) throw notFound('Question');
    const { rowCount } = await this.pool.query(
      `INSERT INTO exam_answers (session_id, question_id, skill, level, choice, correct) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [id, questionId, skill, q.level, choice, q.correctAnswer === choice],
    );
    // Exam mode: no going back on an answer.
    if (!rowCount) throw conflict('already_answered', 'Réponse déjà enregistrée : pas de retour possible');
    return { saved: true };
  }

  /** Issues the single listen of a CO document. A second request is refused. */
  async play(userId: string, id: string, questionId: string) {
    const { session, skill } = await this.currentSection(userId, id, ['CO']);
    if (!session.items[skill].includes(questionId)) throw badRequest('not_in_section', 'Document hors de la section en cours');
    const q = await this.content.byId(questionId);
    if (!q) throw notFound('Document');
    const token = randomToken(24);
    const { rowCount } = await this.pool.query(
      `INSERT INTO audio_plays (session_id, question_id, token, consumed_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [id, questionId, token, q.audioKey ? null : new Date()],
    );
    if (!rowCount) throw conflict('already_played', 'Écoute unique : ce document a déjà été diffusé');
    if (q.audioKey) return { url: `/api/simulator/sessions/${id}/audio/${encodeURIComponent(questionId)}?token=${token}` };
    // No recording uploaded yet: the browser's French voice reads the transcript, once.
    return { tts: q.transcript ?? q.context ?? '' };
  }

  /** Streams a recording once, authenticated by the one-time token issued by `play`. */
  async consumeAudio(id: string, questionId: string, token: string): Promise<string | null> {
    const { rows: [p] } = await this.pool.query<{ question_id: string }>(
      `UPDATE audio_plays SET consumed_at = now() WHERE session_id = $1 AND question_id = $2 AND token = $3 AND consumed_at IS NULL RETURNING question_id`,
      [id, questionId, token],
    );
    if (!p) return null;
    const q = await this.content.byId(questionId);
    return q?.audioKey ?? null;
  }

  async saveWriting(userId: string, plan: Plan, id: string, questionId: string, text: string) {
    const { session, skill } = await this.currentSection(userId, id, ['EE']);
    if (!session.items[skill].includes(questionId)) throw badRequest('not_in_section', 'Sujet hors de la section en cours');
    const q = await this.content.byId(questionId);
    await this.evaluation.submitWriting({ userId, sessionId: id, questionId, task: q?.task ?? 1, text, tier: plan.ai, humanReview: false, evaluate: false });
    return { saved: true };
  }

  async saveRecording(userId: string, plan: Plan, id: string, questionId: string, audio: { data: Buffer; contentType: string; duration: number | null }) {
    const { session, skill } = await this.currentSection(userId, id, ['EO']);
    if (!session.items[skill].includes(questionId)) throw badRequest('not_in_section', 'Sujet hors de la section en cours');
    const q = await this.content.byId(questionId);
    await this.evaluation.submitSpeaking({
      userId, sessionId: id, questionId, task: q?.task ?? 1, audio: audio.data, contentType: audio.contentType,
      duration: audio.duration, tier: plan.ai, humanReview: plan.humanCorrection,
    });
    return { saved: true };
  }

  /** Ends the current section early. There is no way back to a finished section. */
  async nextSection(userId: string, id: string, expectedIndex: number) {
    const session = await this.own(userId, id);
    if (session.status !== 'in_progress') throw conflict('not_in_progress', 'Simulation terminée ou non commencée');
    if (session.section_index !== expectedIndex) return this.state(userId, id); // double click / stale tab
    await this.advance(userId, id, expectedIndex);
    return this.state(userId, id);
  }

  async abandon(userId: string, id: string) {
    await this.own(userId, id);
    await this.pool.query(`UPDATE exam_sessions SET status = 'abandoned', completed_at = now() WHERE id = $1 AND status IN ('created', 'in_progress')`, [id]);
  }

  async recordEvent(userId: string, id: string, type: string, signal: { fingerprint?: string; ip: string | null }) {
    await this.own(userId, id);
    await this.pool.query(`INSERT INTO fraud_signals (user_id, fingerprint, ip, event) VALUES ($1, $2, $3, $4)`, [userId, signal.fingerprint ?? null, signal.ip, `exam_${type}`]);
  }

  // ---------------------------------------------------------------- results

  async list(userId: string) {
    const { rows } = await this.pool.query<SessionRow>(`SELECT * FROM exam_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [userId]);
    return rows.map((s) => ({ id: s.id, type: s.type, skills: s.skills, status: s.status, scores: s.scores, totalScore: s.total_score, startedAt: s.started_at, completedAt: s.completed_at, createdAt: s.created_at }));
  }

  async result(userId: string, id: string) {
    const session = await this.own(userId, id);
    if (session.status === 'created' || session.status === 'in_progress') throw conflict('not_finished', 'La simulation n’est pas terminée');
    const allIds = Object.values(session.items).flat();
    const questions = await this.content.byIds(allIds);
    const { rows: answers } = await this.pool.query<{ question_id: string; choice: number; correct: boolean }>(`SELECT question_id, choice, correct FROM exam_answers WHERE session_id = $1`, [id]);
    const writings = await this.content.writings.find({ sessionId: id }).toArray();
    const recordings = await this.content.audios.find({ sessionId: id }).toArray();
    return {
      id: session.id,
      type: session.type,
      status: session.status,
      scores: session.scores,
      totalScore: session.total_score,
      startedAt: session.started_at,
      completedAt: session.completed_at,
      review: Object.fromEntries(session.skills.map((skill) => [skill, session.items[skill].map((qid) => {
        const q = questions.get(qid);
        const a = answers.find((x) => x.question_id === qid);
        if (skill === 'CO' || skill === 'CE') {
          return {
            id: qid, level: q?.level, statement: q?.statement, context: q?.context, transcript: q?.transcript ?? null,
            options: q?.options ?? [], correctAnswer: q?.correctAnswer, choice: a?.choice ?? null, correct: a?.correct ?? false, explanation: q?.explanation ?? null,
          };
        }
        const w = writings.find((x) => x.questionId === qid);
        const r = recordings.find((x) => x.questionId === qid);
        return {
          id: qid, task: q?.task, statement: q?.statement,
          text: w?.text ?? null, wordCount: w?.wordCount ?? null, transcription: r?.transcription ?? null,
          status: w?.status ?? r?.status ?? 'missing', score: w?.humanReview?.score ?? r?.humanReview?.score ?? w?.aiScore ?? r?.aiScore ?? null,
          feedback: w?.feedback ?? r?.feedback ?? null, humanReview: w?.humanReview ?? r?.humanReview ?? null,
        };
      })])),
    };
  }

  // ---------------------------------------------------------------- internals

  private async pickItems(skill: Skill, seen: string[]): Promise<string[]> {
    if (skill === 'EE' || skill === 'EO') return (await this.content.taskSet(skill)).map((q) => q._id);
    const picked: QuestionDoc[] = [];
    for (const level of LEVELS) picked.push(...(await this.content.sample({ skill, level, type: 'mcq' }, MCQ_MIX[level], seen)));
    const missing = sectionOf(skill).items - picked.length;
    if (missing > 0) {
      const extra = await this.content.sample({ skill, type: 'mcq' }, missing + picked.length, [...seen]);
      picked.push(...extra.filter((q) => !picked.some((p) => p._id === q._id)).slice(0, missing));
    }
    return picked
      .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level))
      .slice(0, sectionOf(skill).items)
      .map((q) => q._id);
  }

  private async own(userId: string, id: string): Promise<SessionRow> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Simulation');
    const { rows: [s] } = await this.pool.query<SessionRow>(`SELECT * FROM exam_sessions WHERE id = $1 AND user_id = $2`, [id, userId]);
    if (!s) throw notFound('Simulation');
    return s;
  }

  private expired(s: SessionRow) {
    return !!s.section_deadline && Date.now() > s.section_deadline.getTime() + GRACE_SECONDS * 1000;
  }

  /** The session's running section, refusing writes once its timer is over (time lock). */
  private async currentSection(userId: string, id: string, allowed: Skill[]) {
    const session = await this.own(userId, id);
    if (session.status !== 'in_progress') throw conflict('not_in_progress', 'Simulation terminée ou non commencée');
    if (this.expired(session)) {
      await this.advance(userId, id, session.section_index);
      throw conflict('section_time_over', 'Temps écoulé pour cette section');
    }
    const skill = session.skills[session.section_index];
    if (!allowed.includes(skill)) throw conflict('wrong_section', `Action impossible pendant la section ${skill}`);
    return { session, skill };
  }

  /** Closes section `fromIndex` and opens the next one (or finishes the exam). Idempotent per index. */
  private async advance(userId: string, id: string, fromIndex: number) {
    const closed = await withTransaction(this.pool, async (tx) => {
      const { rows: [s] } = await tx.query<SessionRow>(`SELECT * FROM exam_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE`, [id, userId]);
      if (!s || s.status !== 'in_progress' || s.section_index !== fromIndex) return null;
      const skill = s.skills[fromIndex];
      const scores = { ...s.scores };
      if (skill === 'CO' || skill === 'CE') scores[skill] = await this.mcqScore(tx, s, skill);
      const next = fromIndex + 1;
      if (next < s.skills.length) {
        await tx.query(
          `UPDATE exam_sessions SET section_index = $2, section_started_at = now(), section_deadline = now() + make_interval(mins => $3), scores = $4 WHERE id = $1`,
          [id, next, sectionOf(s.skills[next]).minutes, JSON.stringify(scores)],
        );
      } else {
        await tx.query(`UPDATE exam_sessions SET section_index = $2, status = 'evaluating', section_deadline = NULL, scores = $3 WHERE id = $1`, [id, next, JSON.stringify(scores)]);
      }
      return { skill, session: s };
    });
    if (!closed) return;
    // Evaluations are queued after commit: inline jobs call back into tryFinalize.
    if (closed.skill === 'EE') {
      const drafts = await this.content.writings.find({ sessionId: id, status: 'draft' }).toArray();
      const { rows: [u] } = await this.pool.query<{ plan_id: string; plan_expires_at: Date | null }>('SELECT plan_id, plan_expires_at FROM users WHERE id = $1', [userId]);
      const plan = effectivePlan(u.plan_id, u.plan_expires_at);
      for (const d of drafts) await this.evaluation.queueWriting(d._id, userId, plan.humanCorrection);
    }
    await this.tryFinalize(id);
  }

  private async mcqScore(tx: pg.PoolClient, s: SessionRow, skill: 'CO' | 'CE'): Promise<SkillScore> {
    const questions = await this.content.byIds(s.items[skill]);
    const { rows } = await tx.query<{ question_id: string; correct: boolean }>(`SELECT question_id, correct FROM exam_answers WHERE session_id = $1 AND skill = $2`, [s.id, skill]);
    const score = scaledMcqScore(s.items[skill].map((qid) => ({
      level: questions.get(qid)?.level ?? 'B1',
      correct: rows.find((r) => r.question_id === qid)?.correct ?? false,
    })));
    return { score, max: 699, cefr: cefrFor(skill, score), nclc: nclcFor(skill, score), progress: progressToC2(skill, score) };
  }

  /** Completes a session once every writing and recording has been evaluated. */
  async tryFinalize(id: string) {
    await withTransaction(this.pool, async (tx) => {
      const { rows: [s] } = await tx.query<SessionRow>(`SELECT * FROM exam_sessions WHERE id = $1 FOR UPDATE`, [id]);
      if (!s || s.status !== 'evaluating') return;
      const scores = { ...s.scores };
      for (const skill of ['EE', 'EO'] as const) {
        if (!s.skills.includes(skill)) continue;
        const docs = skill === 'EE'
          ? await this.content.writings.find({ sessionId: id }).toArray()
          : await this.content.audios.find({ sessionId: id }).toArray();
        if (docs.some((d) => d.status === 'pending' || d.status === 'draft')) return; // still evaluating
        const perTask = s.items[skill].map((qid) => {
          const d = docs.find((x) => x.questionId === qid);
          if (!d) return { score: 0, pending: false }; // task not attempted
          const score = d.humanReview?.score ?? d.aiScore;
          return { score, pending: score === null && d.status === 'awaiting_review' };
        });
        const graded = perTask.filter((t) => t.score !== null) as { score: number }[];
        const pending = perTask.some((t) => t.pending);
        if (graded.length === 0 || pending) {
          scores[skill] = { score: null, max: 20, cefr: null, nclc: null, progress: null, pending };
        } else {
          const score = Math.round(graded.reduce((a, t) => a + t.score, 0) / perTask.length);
          scores[skill] = { score, max: 20, cefr: cefrFor(skill, score), nclc: nclcFor(skill, score), progress: progressToC2(skill, score) };
        }
      }
      const progresses = SKILLS.map((k) => scores[k]?.progress).filter((p): p is number => typeof p === 'number');
      const total = progresses.length ? Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length) : null;
      await tx.query(`UPDATE exam_sessions SET status = 'completed', completed_at = now(), scores = $2, total_score = $3 WHERE id = $1`, [id, JSON.stringify(scores), total]);
    });
  }

  /** Re-applies a teacher's grade to a completed session. */
  async applyHumanReview(sessionId: string) {
    await this.pool.query(`UPDATE exam_sessions SET status = 'evaluating' WHERE id = $1 AND status = 'completed'`, [sessionId]);
    await this.tryFinalize(sessionId);
  }
}
