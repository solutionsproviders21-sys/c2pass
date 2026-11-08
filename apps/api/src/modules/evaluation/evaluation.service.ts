import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { analyseWriting, cefrFromTwenty, EE_TASKS, EO_TASKS, heuristicWritingScore, type AiTier } from '@c2pass/shared';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { CONFIG, type Config } from '../../config.js';
import { JOBS, type Jobs } from '../../infra/jobs.js';
import { STORAGE, type Storage } from '../../infra/storage.js';
import { PG } from '../../infra/tokens.js';
import { ContentRepository } from '../content/content.repository.js';
import type { AudioFileDoc, WritingFeedback, WritingSubmissionDoc } from '../content/content.types.js';
import { LanguageToolClient, OpenAiClient, TextRazorClient, topicCoverage, type LanguageIssue, type Topic } from './providers.js';
import { SPEAKING_SYSTEM, WRITING_SYSTEM, writingUserPrompt } from './prompts.js';

export type EvaluatedListener = (e: { kind: 'writing' | 'speaking'; id: string; sessionId: string | null }) => Promise<void>;

/**
 * IA de correction calibrée C2 (module 2). Three tiers, matching the plans:
 *  - none (Gratuit): deterministic metrics and an indicative score;
 *  - base (Standard): + grammar and spelling check (LanguageTool);
 *  - advanced (Pro / Pack Réussite): + examiner-style assessment by the LLM, and human correction.
 * Evaluations run as background jobs; failures of an external provider degrade to the lower tier.
 */
@Injectable()
export class EvaluationService implements OnModuleInit {
  private readonly logger = new Logger('Evaluation');
  private readonly languageTool: LanguageToolClient;
  private readonly llm: OpenAiClient;
  private readonly textRazor: TextRazorClient;
  /** Topics of each prompt, computed once per question. */
  private readonly promptTopics = new Map<string, Topic[]>();
  private readonly listeners: EvaluatedListener[] = [];

  constructor(
    @Inject(CONFIG) config: Config,
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(JOBS) private readonly jobs: Jobs,
    @Inject(STORAGE) private readonly storage: Storage,
    @Inject(ContentRepository) private readonly content: ContentRepository,
  ) {
    this.languageTool = new LanguageToolClient(config.LANGUAGETOOL_URL);
    this.llm = new OpenAiClient(config);
    this.textRazor = new TextRazorClient(config.TEXTRAZOR_API_KEY, config.TEXTRAZOR_URL);
  }

  onModuleInit() {
    this.jobs.register('evaluate.writing', (d: { id: string }) => this.evaluateWriting(d.id));
    this.jobs.register('evaluate.speaking', (d: { id: string }) => this.evaluateSpeaking(d.id));
  }

  onEvaluated(listener: EvaluatedListener) {
    this.listeners.push(listener);
  }

  get capabilities() {
    return { grammarCheck: this.languageTool.enabled, topicCheck: this.textRazor.enabled, llm: this.llm.enabled };
  }

  /** Creates (or replaces, for exam drafts) a writing submission and schedules its evaluation. */
  async submitWriting(input: { userId: string; sessionId: string | null; questionId: string; task: number; text: string; tier: AiTier; humanReview: boolean; evaluate: boolean }) {
    const metrics = analyseWriting(input.text);
    const now = new Date();
    const existing = input.sessionId ? await this.content.writings.findOne({ sessionId: input.sessionId, questionId: input.questionId }) : null;
    const id = existing?._id ?? randomUUID();
    const doc: WritingSubmissionDoc = {
      _id: id, userId: input.userId, sessionId: input.sessionId, questionId: input.questionId, task: input.task,
      text: input.text, wordCount: metrics.wordCount, lexicalDiversity: metrics.lexicalDiversity, metrics: { ...metrics },
      aiScore: null, feedback: null, tier: input.tier, status: input.evaluate ? 'pending' : 'draft', humanReview: null,
      createdAt: existing?.createdAt ?? now, updatedAt: now,
    };
    await this.content.writings.replaceOne({ _id: id }, doc, { upsert: true });
    if (input.evaluate) await this.queueWriting(id, input.userId, input.humanReview);
    return doc;
  }

  async queueWriting(id: string, userId: string, humanReview: boolean) {
    await this.content.writings.updateOne({ _id: id }, { $set: { status: 'pending', updatedAt: new Date() } });
    if (humanReview) await this.requestHumanReview(id, 'writing', userId);
    await this.jobs.enqueue('evaluate.writing', { id });
  }

  async submitSpeaking(input: { userId: string; sessionId: string | null; questionId: string; task: number; audio: Buffer; contentType: string; duration: number | null; tier: AiTier; humanReview: boolean }) {
    const id = randomUUID();
    const key = `recordings/${input.userId}/${id}`;
    await this.storage.put(key, input.audio, input.contentType);
    if (input.sessionId) await this.content.audios.deleteMany({ sessionId: input.sessionId, questionId: input.questionId });
    const doc: AudioFileDoc = {
      _id: id, userId: input.userId, sessionId: input.sessionId, questionId: input.questionId, task: input.task,
      key, contentType: input.contentType, duration: input.duration, transcription: null, aiScore: null, feedback: null,
      tier: input.tier, status: 'pending', humanReview: null, createdAt: new Date(),
    };
    await this.content.audios.insertOne(doc);
    if (input.humanReview) await this.requestHumanReview(id, 'speaking', input.userId);
    await this.jobs.enqueue('evaluate.speaking', { id });
    return doc;
  }

  async evaluateWriting(id: string) {
    const sub = await this.content.writings.findOne({ _id: id });
    if (!sub) return;
    const question = await this.content.byId(sub.questionId);
    const bounds = EE_TASKS[(sub.task || 3) - 1] ?? EE_TASKS[2];
    try {
      const feedback = await this.assess({ kind: 'writing', text: sub.text, tier: sub.tier, task: sub.task, questionId: sub.questionId, statement: question?.statement ?? '', context: question?.context, bounds });
      await this.content.writings.updateOne({ _id: id }, { $set: { aiScore: feedback.score, feedback, status: 'done', updatedAt: new Date() } });
    } catch (e) {
      this.logger.error(`writing ${id}: ${e instanceof Error ? e.message : e}`);
      await this.content.writings.updateOne({ _id: id }, { $set: { status: 'failed', updatedAt: new Date() } });
    }
    await this.emit({ kind: 'writing', id, sessionId: sub.sessionId });
  }

  async evaluateSpeaking(id: string) {
    const audio = await this.content.audios.findOne({ _id: id });
    if (!audio) return;
    const question = await this.content.byId(audio.questionId);
    const spec = EO_TASKS[(audio.task || 1) - 1] ?? EO_TASKS[0];
    try {
      if (!this.llm.enabled) {
        // Without speech recognition the recording waits for a teacher (Pro) or stays unscored.
        await this.content.audios.updateOne({ _id: id }, { $set: { status: 'awaiting_review' } });
      } else {
        const file = await this.storage.get(audio.key);
        if (!file) throw new Error('recording not found');
        const transcription = await this.llm.transcribe(file.data, file.contentType);
        // Speaking rate of roughly 1.2–3 words per second over the task window.
        const bounds = { minWords: Math.round(spec.seconds * 1.2 * 0.5), maxWords: Math.round(spec.seconds * 3) };
        const feedback = await this.assess({ kind: 'speaking', text: transcription, tier: audio.tier, task: audio.task, statement: question?.statement ?? '', context: null, bounds });
        await this.content.audios.updateOne({ _id: id }, { $set: { transcription, aiScore: feedback.score, feedback, status: 'done' } });
      }
    } catch (e) {
      this.logger.error(`speaking ${id}: ${e instanceof Error ? e.message : e}`);
      await this.content.audios.updateOne({ _id: id }, { $set: { status: 'failed' } });
    }
    await this.emit({ kind: 'speaking', id, sessionId: audio.sessionId });
  }

  private async assess(input: { kind: 'writing' | 'speaking'; text: string; tier: AiTier; task: number; questionId?: string; statement: string; context?: string | null; bounds: { minWords: number; maxWords: number } }): Promise<WritingFeedback> {
    const metrics = analyseWriting(input.text);
    const engine = ['metrics'];
    let issues: LanguageIssue[] = [];
    if (input.tier !== 'none' && input.kind === 'writing' && this.languageTool.enabled) {
      try {
        issues = await this.languageTool.check(input.text);
        engine.push('languagetool');
      } catch (e) {
        this.logger.warn(`LanguageTool unavailable: ${e instanceof Error ? e.message : e}`);
      }
    }
    const corrections = issues.slice(0, 20).map((i) => ({
      excerpt: input.text.slice(i.offset, i.offset + i.length),
      suggestion: i.replacements[0] ?? '',
      message: i.message,
    }));
    const topics = input.tier !== 'none' && input.kind === 'writing' ? await this.topicCheck(input) : null;
    if (topics) engine.push('textrazor');
    // An answer that leaves aside most of the subject cannot get a good mark, however well written.
    const offTopic = topics !== null && topics.ratio < 0.25;
    const heuristic = Math.max(0, heuristicWritingScore(metrics, input.bounds, engine.includes('languagetool') ? issues.length : null) - (offTopic ? 3 : 0));
    const strengths = strengthsFrom(metrics);
    const improvements = improvementsFrom(metrics, input.bounds);
    if (topics && topics.ratio >= 0.5) strengths.push(`Le texte traite bien le sujet (${topics.shared.slice(0, 3).join(', ')}).`);
    if (topics && topics.ratio < 0.5) {
      improvements.unshift(`${offTopic ? 'Le texte s’éloigne du sujet' : 'Une partie du sujet n’est pas traitée'} : abordez aussi ${topics.missing.slice(0, 3).join(', ')}.`);
    }
    const base: WritingFeedback = {
      score: heuristic,
      cefr: cefrFromTwenty(heuristic),
      summary: describeMetrics(metrics, input.bounds),
      strengths,
      improvements,
      corrections,
      engine,
    };

    if (input.tier === 'advanced' && this.llm.enabled) {
      try {
        const llm = await this.llm.assess(
          input.kind === 'writing' ? WRITING_SYSTEM : SPEAKING_SYSTEM,
          writingUserPrompt({ task: input.task, statement: input.statement, context: input.context, text: input.text, metrics, ...input.bounds }),
        );
        return {
          score: llm.score,
          cefr: llm.cefr || cefrFromTwenty(llm.score),
          summary: llm.summary || base.summary,
          strengths: llm.strengths.length ? llm.strengths : base.strengths,
          improvements: llm.improvements.length ? llm.improvements : base.improvements,
          corrections: [...llm.corrections, ...corrections].slice(0, 20),
          engine: [...engine, 'llm'],
        };
      } catch (e) {
        this.logger.warn(`LLM grading unavailable, falling back to metrics: ${e instanceof Error ? e.message : e}`);
      }
    }
    return base;
  }

  /** Coverage of the prompt's topics by the answer (TextRazor), or null when unavailable or not meaningful. */
  private async topicCheck(input: { text: string; questionId?: string; statement: string; context?: string | null }) {
    if (!this.textRazor.enabled || !input.statement) return null;
    try {
      const key = input.questionId ?? input.statement;
      let prompt = this.promptTopics.get(key);
      if (!prompt) {
        prompt = await this.textRazor.topics([input.context, input.statement].filter(Boolean).join('\n'));
        if (this.promptTopics.size > 2000) this.promptTopics.clear();
        this.promptTopics.set(key, prompt);
      }
      return topicCoverage(prompt, await this.textRazor.topics(input.text));
    } catch (e) {
      this.logger.warn(`TextRazor unavailable: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  private async requestHumanReview(submissionId: string, kind: 'writing' | 'speaking', userId: string) {
    await this.pool.query(
      `INSERT INTO human_reviews (submission_id, kind, user_id) VALUES ($1, $2, $3) ON CONFLICT (submission_id) DO NOTHING`,
      [submissionId, kind, userId],
    );
  }

  private async emit(e: Parameters<EvaluatedListener>[0]) {
    for (const l of this.listeners) await l(e);
  }
}

function describeMetrics(m: ReturnType<typeof analyseWriting>, bounds: { minWords: number; maxWords: number }) {
  const length = m.wordCount < bounds.minWords ? `trop court (${m.wordCount} mots pour ${bounds.minWords} attendus)`
    : m.wordCount > bounds.maxWords * 1.1 ? `trop long (${m.wordCount} mots, maximum ${bounds.maxWords})`
    : `de longueur adaptée (${m.wordCount} mots)`;
  return `Texte ${length}, diversité lexicale de ${Math.round(m.lexicalDiversity * 100)} %, ${m.advancedConnectors.length} connecteur(s) avancé(s) et ${m.complexStructures} structure(s) complexe(s).`;
}

function strengthsFrom(m: ReturnType<typeof analyseWriting>) {
  const s: string[] = [];
  if (m.lexicalDiversity >= 0.7) s.push('Vocabulaire varié, peu de répétitions.');
  if (m.advancedConnectors.length >= 2) s.push(`Bonne articulation logique (${m.advancedConnectors.slice(0, 4).join(', ')}).`);
  if (m.complexStructures >= 2) s.push('Emploi de structures syntaxiques complexes.');
  return s;
}

function improvementsFrom(m: ReturnType<typeof analyseWriting>, bounds: { minWords: number; maxWords: number }) {
  const s: string[] = [];
  if (m.wordCount < bounds.minWords) s.push(`Développez davantage : visez au moins ${bounds.minWords} mots.`);
  if (m.lexicalDiversity < 0.65) s.push('Variez le lexique : remplacez les mots passe-partout (faire, chose, problème) par des termes précis.');
  if (m.advancedConnectors.length < 2) s.push('Ajoutez des connecteurs de niveau C2 : certes… néanmoins, par voie de conséquence, il n’en demeure pas moins que.');
  if (m.complexStructures < 1) s.push('Intégrez des subordonnées (lequel, dont, bien que + subjonctif) pour enrichir la syntaxe.');
  if (m.avgSentenceLength > 32) s.push('Raccourcissez certaines phrases pour gagner en clarté.');
  return s;
}
