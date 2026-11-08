import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextRazorClient, topicCoverage } from './providers.js';

const t = (label: string, score: number) => ({ label, score });

describe('TextRazor topic check', () => {
  afterEach(() => vi.restoreAllMocks());

  it('measures how much of the prompt the answer treats', () => {
    const prompt = [t('Immigration', 1), t('Main-d’œuvre', 0.9), t('Fuite des cerveaux', 0.8), t('Économie', 0.6), t('Politique', 0.2)];
    const onTopic = topicCoverage(prompt, [t('immigration', 0.9), t('Fuite des cerveaux', 0.7), t('Économie', 0.5)]);
    expect(onTopic).toEqual({ ratio: 0.75, shared: ['Immigration', 'Fuite des cerveaux', 'Économie'], missing: ['Main-d’œuvre'] });
    // A weak mention (score below 0.3) does not count as treating the topic.
    expect(topicCoverage(prompt, [t('Football', 1), t('Immigration', 0.1)])?.ratio).toBe(0);
    // A prompt too short to yield topics is not judged.
    expect(topicCoverage([t('Immigration', 1)], [])).toBeNull();
  });

  it('calls the API in French with the key and sorts topics by score', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      ok: true, response: { topics: [t('Économie', 0.4), t('Immigration', 0.95)] },
    })));
    const topics = await new TextRazorClient('key').topics('Un texte sur l’immigration.');
    expect(topics.map((x) => x.label)).toEqual(['Immigration', 'Économie']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.textrazor.com/');
    expect((init?.headers as Record<string, string>)['x-textrazor-key']).toBe('key');
    expect(String(init?.body)).toContain('languageOverride=fre');
    expect(await new TextRazorClient(undefined).topics('x')).toEqual([]);
  });

  it('reports API errors so the evaluation can go on without it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: false, error: 'Invalid key' })));
    await expect(new TextRazorClient('bad').topics('x')).rejects.toThrow('Invalid key');
  });
});
