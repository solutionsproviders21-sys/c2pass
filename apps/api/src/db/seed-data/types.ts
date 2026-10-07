import type { Level, Skill } from '@c2pass/shared';

export interface SeedMcq {
  level: Level;
  theme: string;
  /** CE: the text to read. CO: the transcript, spoken once (browser voice until a real recording is uploaded). */
  context: string;
  statement: string;
  options: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  explanation: string;
}

export interface SeedTask {
  skill: Extract<Skill, 'EE' | 'EO'>;
  set: number;
  task: 1 | 2 | 3;
  level: Level;
  theme: string;
  statement: string;
  context?: string;
}
