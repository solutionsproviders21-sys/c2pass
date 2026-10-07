/**
 * Deterministic writing metrics used by the C2 evaluator (and as a fallback when no LLM is configured):
 * word count, lexical richness (type-token ratio), advanced logical connectors and sentence complexity.
 */

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFC')
    .match(/[a-zàâäçéèêëîïôöùûüÿœæ]+(?:['’-][a-zàâäçéèêëîïôöùûüÿœæ]+)*/giu) ?? [];
}

export function wordCount(text: string): number {
  return words(text).length;
}

/**
 * Type-token ratio computed on a moving window (MATTR) so that long texts are not penalised:
 * a plain TTR mechanically drops as a text grows.
 */
export function lexicalDiversity(text: string, window = 50): number {
  const w = words(text);
  if (w.length === 0) return 0;
  if (w.length <= window) return round(new Set(w).size / w.length);
  let sum = 0;
  let n = 0;
  for (let i = 0; i + window <= w.length; i++) {
    sum += new Set(w.slice(i, i + window)).size / window;
    n++;
  }
  return round(sum / n);
}

/** Connectors expected at C1/C2 (cahier des charges : « nonobstant », « par voie de conséquence »…). */
export const ADVANCED_CONNECTORS = [
  'nonobstant', 'par voie de conséquence', 'en dépit de', 'quand bien même', 'force est de constater',
  'il n’en demeure pas moins', "il n'en demeure pas moins", 'dès lors', 'en revanche', 'toutefois',
  'néanmoins', 'par conséquent', 'en outre', 'de surcroît', 'qui plus est', 'certes', 'ainsi',
  'à cet égard', 'en définitive', 'somme toute', 'bien que', 'quoique', 'afin que', 'de sorte que',
  'à l’inverse', "à l'inverse", 'au demeurant', 'partant', 'cependant', 'pour autant', 'en somme',
  'd’une part', "d'une part", 'd’autre part', "d'autre part", 'eu égard à', 'à supposer que',
];

export const BASIC_CONNECTORS = ['et', 'mais', 'donc', 'parce que', 'aussi', 'alors', 'puis', 'après', 'car'];

export function connectorsUsed(text: string): { advanced: string[]; basic: string[] } {
  const t = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  const has = (c: string) => new RegExp(`(^|[^\\p{L}])${escapeRe(c)}([^\\p{L}]|$)`, 'u').test(t);
  const advanced = [...new Set(ADVANCED_CONNECTORS.filter(has).map((c) => c.replace('’', "'")))];
  const basic = BASIC_CONNECTORS.filter(has);
  return { advanced, basic };
}

/** Markers of complex syntax: subjunctive triggers, relative pronouns, literary tenses. */
const COMPLEX_MARKERS = [
  /\b(lequel|laquelle|lesquels|lesquelles|auquel|auxquels|duquel|desquels|dont)\b/giu,
  /\b(bien qu|quoiqu|afin qu|pour qu|avant qu|à moins qu|pourvu qu|sans qu)e?\b/giu,
  /\b\w+(assent|issent|ussent|ât|ît|ût)\b/giu, // imparfait du subjonctif
  /\b(eût|fût|eussions|fussions)\b/giu,
  /\b(il|ce) (est|serait|semble) (indispensable|nécessaire|souhaitable|essentiel|primordial) que\b/giu,
];

export function complexStructures(text: string): number {
  return COMPLEX_MARKERS.reduce((n, re) => n + (text.match(re)?.length ?? 0), 0);
}

export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?…])\s+/u).map((s) => s.trim()).filter(Boolean);
}

export interface WritingMetrics {
  wordCount: number;
  lexicalDiversity: number;
  advancedConnectors: string[];
  basicConnectors: string[];
  complexStructures: number;
  avgSentenceLength: number;
}

export function analyseWriting(text: string): WritingMetrics {
  const s = sentences(text);
  const wc = wordCount(text);
  const c = connectorsUsed(text);
  return {
    wordCount: wc,
    lexicalDiversity: lexicalDiversity(text),
    advancedConnectors: c.advanced,
    basicConnectors: c.basic,
    complexStructures: complexStructures(text),
    avgSentenceLength: s.length ? round(wc / s.length) : 0,
  };
}

/**
 * Heuristic /20 score from metrics and the number of language errors found by the checker.
 * Used for the "IA base" tier and as the fallback when the LLM is unavailable.
 */
export function heuristicWritingScore(m: WritingMetrics, bounds: { minWords: number; maxWords: number }, errors: number): number {
  if (m.wordCount < Math.min(20, bounds.minWords)) return Math.min(2, Math.round(m.wordCount / 10));
  let score = 6;
  // Task completion: length within the expected range.
  if (m.wordCount >= bounds.minWords && m.wordCount <= bounds.maxWords * 1.1) score += 3;
  else if (m.wordCount >= bounds.minWords * 0.8) score += 1.5;
  // Lexical richness.
  score += clamp((m.lexicalDiversity - 0.55) * 20, 0, 4);
  // Cohesion: advanced connectors.
  score += Math.min(3, m.advancedConnectors.length * 0.75);
  // Syntax complexity.
  score += Math.min(2, m.complexStructures * 0.5);
  // Sentence length sweet spot (12–28 words).
  if (m.avgSentenceLength >= 12 && m.avgSentenceLength <= 28) score += 1;
  // Accuracy: errors per 100 words.
  const density = (errors / Math.max(m.wordCount, 1)) * 100;
  score += density <= 1 ? 1 : density <= 3 ? 0 : density <= 6 ? -2 : -4;
  return clamp(Math.round(score), 0, 20);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['’]/g, "['’]");
}
