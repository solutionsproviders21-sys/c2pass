import type { Config } from '../../config.js';

export interface LanguageIssue {
  offset: number;
  length: number;
  message: string;
  replacements: string[];
  category: string;
}

/** LanguageTool HTTP API (public api.languagetool.org or a self-hosted server). */
export class LanguageToolClient {
  constructor(private readonly baseUrl: string | undefined) {}

  get enabled() {
    return !!this.baseUrl;
  }

  async check(text: string): Promise<LanguageIssue[]> {
    if (!this.baseUrl) return [];
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ text, language: 'fr' }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`LanguageTool failed (${res.status})`);
    const body = (await res.json()) as {
      matches: { offset: number; length: number; message: string; replacements: { value: string }[]; rule: { issueType?: string; category?: { id?: string } } }[];
    };
    return body.matches.map((m) => ({
      offset: m.offset,
      length: m.length,
      message: m.message,
      replacements: m.replacements.slice(0, 3).map((r) => r.value),
      category: m.rule.issueType ?? m.rule.category?.id ?? 'grammar',
    }));
  }
}

/** One topic found by TextRazor, from its Wikipedia-based topic graph (score 0–1). */
export interface Topic {
  label: string;
  score: number;
}

/**
 * TextRazor (cahier des charges p. 10, 15): semantic analysis. Used to check that an answer deals with the subject:
 * the topics of the answer are compared with those of the prompt.
 */
export class TextRazorClient {
  constructor(private readonly apiKey: string | undefined, private readonly baseUrl = 'https://api.textrazor.com') {}

  get enabled() {
    return !!this.apiKey;
  }

  async topics(text: string): Promise<Topic[]> {
    if (!this.apiKey) return [];
    const res = await fetch(`${this.baseUrl}/`, {
      method: 'POST',
      headers: { 'x-textrazor-key': this.apiKey, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ text: text.slice(0, 20_000), extractors: 'topics', languageOverride: 'fre' }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`TextRazor failed (${res.status})`);
    const body = (await res.json()) as { ok?: boolean; error?: string; response?: { topics?: { label: string; score: number }[] } };
    if (body.ok === false) throw new Error(`TextRazor failed (${body.error ?? 'unknown error'})`);
    return (body.response?.topics ?? []).map((t) => ({ label: t.label, score: t.score })).sort((a, b) => b.score - a.score);
  }
}

/**
 * Share of the prompt's main topics (score ≥ 0.5, at most 8) that the answer also treats (score ≥ 0.3), or null when
 * the prompt yields too few topics to judge.
 */
export function topicCoverage(prompt: Topic[], answer: Topic[]) {
  const main = prompt.filter((t) => t.score >= 0.5).slice(0, 8);
  if (main.length < 2) return null;
  const treated = new Set(answer.filter((t) => t.score >= 0.3).map((t) => t.label.toLowerCase()));
  const shared = main.filter((t) => treated.has(t.label.toLowerCase()));
  return { ratio: shared.length / main.length, shared: shared.map((t) => t.label), missing: main.filter((t) => !shared.includes(t)).map((t) => t.label) };
}

export interface LlmAssessment {
  score: number;
  cefr: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  corrections: { excerpt: string; suggestion: string; message: string }[];
}

/**
 * OpenAI (GPT-4 Turbo by default, cahier des charges §4.2) through the REST API:
 * chat completions in JSON mode for grading, audio transcriptions for speaking.
 */
export class OpenAiClient {
  constructor(private readonly cfg: Pick<Config, 'OPENAI_API_KEY' | 'OPENAI_MODEL' | 'OPENAI_TRANSCRIBE_MODEL'>) {}

  get enabled() {
    return !!this.cfg.OPENAI_API_KEY;
  }

  async assess(system: string, user: string): Promise<LlmAssessment> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.cfg.OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`OpenAI grading failed (${res.status})`);
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    const parsed = JSON.parse(body.choices[0].message.content) as Partial<LlmAssessment>;
    const score = Number(parsed.score);
    if (!Number.isFinite(score)) throw new Error('OpenAI grading returned no score');
    return {
      score: Math.max(0, Math.min(20, Math.round(score))),
      cefr: String(parsed.cefr ?? ''),
      summary: String(parsed.summary ?? ''),
      strengths: (parsed.strengths ?? []).map(String).slice(0, 6),
      improvements: (parsed.improvements ?? []).map(String).slice(0, 6),
      corrections: (parsed.corrections ?? []).slice(0, 15).map((c) => ({ excerpt: String(c.excerpt ?? ''), suggestion: String(c.suggestion ?? ''), message: String(c.message ?? '') })),
    };
  }

  async transcribe(audio: Buffer, contentType: string): Promise<string> {
    const form = new FormData();
    const ext = contentType.includes('ogg') ? 'ogg' : contentType.includes('mp4') || contentType.includes('m4a') ? 'm4a' : contentType.includes('wav') ? 'wav' : 'webm';
    form.append('file', new Blob([new Uint8Array(audio)], { type: contentType }), `recording.${ext}`);
    form.append('model', this.cfg.OPENAI_TRANSCRIBE_MODEL);
    form.append('language', 'fr');
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`OpenAI transcription failed (${res.status})`);
    return ((await res.json()) as { text: string }).text;
  }
}
