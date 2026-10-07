import { describe, expect, it } from 'vitest';
import {
  analyseWriting, cefrFromScaled, cefrFromTwenty, connectorsUsed, effectivePlan, heuristicWritingScore,
  lexicalDiversity, nclcFor, opensBooking, progressToC2, scaledMcqScore, wordCount,
} from './index.js';

describe('TCF scoring', () => {
  it('maps a perfect and an empty paper to the ends of the scale', () => {
    const items = (['A1', 'B2', 'C2'] as const).map((level) => ({ level, correct: true }));
    expect(scaledMcqScore(items)).toBe(699);
    expect(scaledMcqScore(items.map((i) => ({ ...i, correct: false })))).toBe(100);
  });

  it('weighs hard items more than easy ones', () => {
    const easy = scaledMcqScore([{ level: 'A1', correct: true }, { level: 'C2', correct: false }]);
    const hard = scaledMcqScore([{ level: 'A1', correct: false }, { level: 'C2', correct: true }]);
    expect(hard).toBeGreaterThan(easy);
  });

  it('converts scores to CEFR and NCLC', () => {
    expect(cefrFromScaled(612)).toBe('C2');
    expect(cefrFromScaled(450)).toBe('B2');
    expect(cefrFromTwenty(16)).toBe('C2');
    expect(nclcFor('CO', 549)).toBe(10);
    expect(nclcFor('CE', 523)).toBe(8);
    expect(nclcFor('EE', 12)).toBe(8);
    expect(nclcFor('EO', 3)).toBe(0);
    expect(progressToC2('CO', 300)).toBe(50);
    expect(progressToC2('EE', 20)).toBe(100);
  });
});

describe('writing analysis', () => {
  const c2 = `Le télétravail généralisé constitue, certes, une avancée considérable ; nonobstant, il n'en demeure pas moins
    qu'il fragilise le lien social. Bien que les outils numériques permettent des échanges constants, ils ne sauraient
    remplacer la spontanéité des rencontres fortuites, lesquelles nourrissent la confiance. Par voie de conséquence,
    il est indispensable que les entreprises repensent leurs rituels collectifs.`;
  const basic = `Le télétravail c'est bien et c'est pas bien. On travaille à la maison et on est content mais on est seul. Donc c'est pas bien.`;

  it('counts words with elisions and hyphens', () => {
    expect(wordCount("L'été, c'est-à-dire aujourd'hui.")).toBe(3);
  });

  it('detects advanced connectors, including the ones named in the spec', () => {
    const { advanced } = connectorsUsed(c2);
    expect(advanced).toEqual(expect.arrayContaining(['nonobstant', 'par voie de conséquence', 'certes', 'bien que']));
    expect(connectorsUsed(basic).advanced).toEqual([]);
  });

  it('ranks a C2 text above a basic one', () => {
    const bounds = { minWords: 40, maxWords: 180 };
    const a = heuristicWritingScore(analyseWriting(c2), bounds, 0);
    const b = heuristicWritingScore(analyseWriting(basic), bounds, 3);
    expect(a).toBeGreaterThan(b);
    expect(lexicalDiversity(c2)).toBeGreaterThan(lexicalDiversity(basic));
    expect(analyseWriting(c2).complexStructures).toBeGreaterThan(0);
  });
});

describe('plans and centres', () => {
  it('falls back to the free plan once a paid plan expires', () => {
    const now = new Date('2026-06-01');
    expect(effectivePlan('pro', '2026-07-01', now).id).toBe('pro');
    expect(effectivePlan('pro', '2026-05-01', now).id).toBe('free');
    expect(effectivePlan('unknown', null, now).id).toBe('free');
  });

  it('alerts only when a centre becomes open', () => {
    expect(opensBooking('full', 'open')).toBe(true);
    expect(opensBooking('open', 'open')).toBe(false);
    expect(opensBooking('open', 'full')).toBe(false);
  });
});
