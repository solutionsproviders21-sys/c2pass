import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Level, Skill } from '@c2pass/shared';
import type { Collection, Db } from 'mongodb';
import { MONGO } from '../../infra/tokens.js';
import type { AudioFileDoc, CourseDoc, QuestionDoc, WritingSubmissionDoc } from './content.types.js';

@Injectable()
export class ContentRepository implements OnModuleInit {
  readonly questions: Collection<QuestionDoc>;
  readonly courses: Collection<CourseDoc>;
  readonly writings: Collection<WritingSubmissionDoc>;
  readonly audios: Collection<AudioFileDoc>;

  constructor(@Inject(MONGO) db: Db) {
    this.questions = db.collection<QuestionDoc>('questions');
    this.courses = db.collection<CourseDoc>('courses');
    this.writings = db.collection<WritingSubmissionDoc>('writing_submissions');
    this.audios = db.collection<AudioFileDoc>('audio_files');
  }

  async onModuleInit() {
    await this.questions.createIndex({ skill: 1, level: 1, active: 1 });
    await this.writings.createIndex({ userId: 1, createdAt: -1 });
    await this.audios.createIndex({ userId: 1, createdAt: -1 });
  }

  byId(id: string) {
    return this.questions.findOne({ _id: id });
  }

  async byIds(ids: string[]): Promise<Map<string, QuestionDoc>> {
    const docs = await this.questions.find({ _id: { $in: ids } }).toArray();
    return new Map(docs.map((d) => [d._id, d]));
  }

  /**
   * Random active questions of a skill/level, avoiding `exclude`.
   * Sampling happens in the API rather than with $sample so it also works on Mongo-compatible engines.
   */
  async sample(filter: { skill: Skill; level?: Level; type?: QuestionDoc['type'] }, count: number, exclude: string[] = []): Promise<QuestionDoc[]> {
    const query: Record<string, unknown> = { skill: filter.skill, active: true };
    if (filter.level) query.level = filter.level;
    if (filter.type) query.type = filter.type;
    const ids = (await this.questions.find(query, { projection: { _id: 1 } }).toArray()).map((d) => d._id);
    const excluded = new Set(exclude);
    const pool = ids.filter((id) => !excluded.has(id));
    const source = pool.length >= count ? pool : ids; // when everything was seen, allow repeats
    const picked = shuffle(source).slice(0, count);
    const map = await this.byIds(picked);
    return picked.map((id) => map.get(id)!).filter(Boolean);
  }

  async countBySkillAndLevel() {
    return this.questions
      .aggregate<{ _id: { skill: Skill; level: Level }; n: number }>([
        { $match: { active: true } },
        { $group: { _id: { skill: '$skill', level: '$level' }, n: { $sum: 1 } } },
      ])
      .toArray();
  }

  /** The three EE or EO tasks of one set (a complete exam section). */
  async taskSet(skill: 'EE' | 'EO', exclude: number[] = []): Promise<QuestionDoc[]> {
    const sets = (await this.questions.distinct('set', { skill, active: true })) as number[];
    const candidates = sets.filter((s) => !exclude.includes(s));
    const set = shuffle(candidates.length ? candidates : sets)[0];
    if (set === undefined) return [];
    return this.questions.find({ skill, set, active: true }).sort({ task: 1 }).toArray();
  }
}

export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
