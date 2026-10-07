import type { Level, Skill } from '@c2pass/shared';

/** MongoDB `questions` collection (cahier des charges §5.2). */
export interface QuestionDoc {
  _id: string;
  skill: Skill;
  level: Level;
  type: 'mcq' | 'writing' | 'speaking';
  theme: string;
  statement: string;
  /** CE: the text. EE task 3: the two documents. */
  context?: string | null;
  /** CO: what is said in the recording (revealed after answering in training, never during an exam). */
  transcript?: string | null;
  /** Storage key of the uploaded recording; without it the browser voice reads the transcript once. */
  audioKey?: string | null;
  options?: string[];
  correctAnswer?: number;
  /** Why each wrong option is wrong (same order as `options`; empty for the correct one). */
  distractors?: string[];
  explanation?: string;
  /** EE/EO task number (1–3) and the set it belongs to. */
  task?: number;
  set?: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CourseDoc {
  _id: string;
  skill: Skill | 'GRAM';
  level: string;
  title: string;
  summary: string;
  sections: { heading: string; body: string }[];
  lexicon?: { term: string; definition: string; example: string }[];
  order: number;
}

export interface WritingFeedback {
  score: number | null;
  cefr: string | null;
  summary: string;
  strengths: string[];
  improvements: string[];
  corrections: { excerpt: string; suggestion: string; message: string }[];
  engine: string[];
}

/** MongoDB `writing_submissions` collection. */
export interface WritingSubmissionDoc {
  _id: string;
  userId: string;
  sessionId: string | null;
  questionId: string;
  task: number;
  text: string;
  wordCount: number;
  lexicalDiversity: number;
  metrics: Record<string, unknown>;
  aiScore: number | null;
  feedback: WritingFeedback | null;
  tier: 'none' | 'base' | 'advanced';
  status: 'draft' | 'pending' | 'done' | 'failed';
  humanReview?: { score: number; comment: string; teacherId: string; at: Date } | null;
  createdAt: Date;
  updatedAt: Date;
}

/** MongoDB `audio_files` collection: candidate recordings (EO). */
export interface AudioFileDoc {
  _id: string;
  userId: string;
  sessionId: string | null;
  questionId: string;
  task: number;
  key: string;
  contentType: string;
  duration: number | null;
  transcription: string | null;
  aiScore: number | null;
  feedback: WritingFeedback | null;
  tier: 'none' | 'base' | 'advanced';
  status: 'pending' | 'done' | 'failed' | 'awaiting_review';
  humanReview?: { score: number; comment: string; teacherId: string; at: Date } | null;
  createdAt: Date;
}

/** What a candidate may see of a question while answering. */
export function publicQuestion(q: QuestionDoc) {
  return {
    id: q._id,
    skill: q.skill,
    level: q.level,
    type: q.type,
    theme: q.theme,
    statement: q.statement,
    context: q.skill === 'CO' ? null : (q.context ?? null),
    options: q.options ?? [],
    task: q.task ?? null,
    hasAudio: q.skill === 'CO',
    hasRecording: !!q.audioKey,
  };
}
