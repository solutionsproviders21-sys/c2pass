/**
 * TCF Canada exam format and scoring.
 * CO/CE are scored 0–699; EE/EO are scored 0–20. CEFR bands and NCLC equivalences
 * follow the grids published by France Éducation international and IRCC.
 */

export const SKILLS = ['CO', 'CE', 'EE', 'EO'] as const;
export type Skill = (typeof SKILLS)[number];

export const SKILL_LABELS: Record<Skill, string> = {
  CO: 'Compréhension orale',
  CE: 'Compréhension écrite',
  EE: 'Expression écrite',
  EO: 'Expression orale',
};

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type Level = (typeof LEVELS)[number];

/** Official TCF Canada structure: order, question/task count and duration of each section. */
export const EXAM_SECTIONS: { skill: Skill; items: number; minutes: number }[] = [
  { skill: 'CO', items: 39, minutes: 35 },
  { skill: 'CE', items: 39, minutes: 60 },
  { skill: 'EE', items: 3, minutes: 60 },
  { skill: 'EO', items: 3, minutes: 12 },
];

export function sectionOf(skill: Skill) {
  return EXAM_SECTIONS.find((s) => s.skill === skill)!;
}

/** Points earned by a correct MCQ answer depend on the item's difficulty (harder items weigh more). */
export const ITEM_WEIGHT: Record<Level, number> = { A1: 3, A2: 9, B1: 15, B2: 21, C1: 26, C2: 33 };

/**
 * Converts MCQ results into a 100–699 scaled score.
 * The scale is calibrated so a perfect paper of the official difficulty mix scores 699
 * and an empty paper scores 100 (the floor of the TCF scale).
 */
export function scaledMcqScore(answers: { level: Level; correct: boolean }[]): number {
  if (answers.length === 0) return 100;
  const max = answers.reduce((s, a) => s + ITEM_WEIGHT[a.level], 0);
  const earned = answers.reduce((s, a) => s + (a.correct ? ITEM_WEIGHT[a.level] : 0), 0);
  return Math.round(100 + (599 * earned) / max);
}

export function cefrFromScaled(score: number): Level | 'Pré-A1' {
  if (score >= 600) return 'C2';
  if (score >= 500) return 'C1';
  if (score >= 400) return 'B2';
  if (score >= 300) return 'B1';
  if (score >= 200) return 'A2';
  if (score >= 100) return 'A1';
  return 'Pré-A1';
}

export function cefrFromTwenty(score: number): Level | 'Pré-A1' {
  if (score >= 16) return 'C2';
  if (score >= 14) return 'C1';
  if (score >= 10) return 'B2';
  if (score >= 6) return 'B1';
  if (score >= 4) return 'A2';
  if (score >= 1) return 'A1';
  return 'Pré-A1';
}

export function cefrFor(skill: Skill, score: number) {
  return skill === 'CO' || skill === 'CE' ? cefrFromScaled(score) : cefrFromTwenty(score);
}

/** Lower bound of each NCLC level (Niveaux de compétence linguistique canadiens), per skill. */
const NCLC_TABLE: Record<Skill, [nclc: number, min: number][]> = {
  CO: [[10, 549], [9, 523], [8, 503], [7, 458], [6, 398], [5, 369], [4, 331]],
  CE: [[10, 549], [9, 524], [8, 499], [7, 453], [6, 406], [5, 375], [4, 342]],
  EE: [[10, 16], [9, 14], [8, 12], [7, 10], [6, 7], [5, 6], [4, 4]],
  EO: [[10, 16], [9, 14], [8, 12], [7, 10], [6, 7], [5, 6], [4, 4]],
};

/** NCLC level for a score, or 0 when below NCLC 4. NCLC 10 means "10 and above". */
export function nclcFor(skill: Skill, score: number): number {
  for (const [nclc, min] of NCLC_TABLE[skill]) if (score >= min) return nclc;
  return 0;
}

/** Progress towards C2 for one skill, as a 0–100 percentage of the C2 threshold. */
export function progressToC2(skill: Skill, score: number): number {
  const target = skill === 'CO' || skill === 'CE' ? 600 : 16;
  return Math.max(0, Math.min(100, Math.round((score / target) * 100)));
}

/** Word bounds of the three EE tasks (TCF Canada). */
export const EE_TASKS = [
  { task: 1, minWords: 60, maxWords: 120, title: 'Message (décrire, raconter, expliquer)' },
  { task: 2, minWords: 120, maxWords: 150, title: 'Article / compte rendu' },
  { task: 3, minWords: 120, maxWords: 180, title: 'Texte argumenté (comparer deux points de vue)' },
] as const;

/** EO tasks: duration in seconds of the recording window for each task. */
export const EO_TASKS = [
  { task: 1, seconds: 120, title: 'Entretien dirigé', prepSeconds: 0 },
  { task: 2, seconds: 330, title: 'Exercice en interaction', prepSeconds: 120 },
  { task: 3, seconds: 270, title: "Expression d'un point de vue", prepSeconds: 0 },
] as const;
