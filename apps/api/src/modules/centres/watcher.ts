/**
 * Veille automatisée légale (module 4, refonte éthique).
 * - reads only public pages, at a 5–10 minute interval, one request at a time per host;
 * - honours robots.txt for our user agent and identifies itself honestly;
 * - never submits forms, solves captchas or uses proxies: it only infers availability from page text.
 */
import vm from 'node:vm';

export interface RobotsRules {
  allows(path: string): boolean;
}

/** Minimal robots.txt parser: groups for our agent (or *), Allow/Disallow with longest-match precedence. */
export function parseRobots(txt: string, userAgent: string): RobotsRules {
  const agent = userAgent.toLowerCase().split('/')[0];
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === 'allow' || field === 'disallow') && current) {
      lastWasAgent = false;
      if (field === 'disallow' && value === '') continue; // empty Disallow = allow everything
      current.rules.push({ allow: field === 'allow', path: value });
    } else {
      lastWasAgent = false;
    }
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  const rules = chosen.flatMap((g) => g.rules);
  return {
    allows(path: string) {
      let best: { allow: boolean; len: number } | null = null;
      for (const r of rules) {
        if (matches(path, r.path) && (!best || r.path.length > best.len || (r.path.length === best.len && r.allow))) best = { allow: r.allow, len: r.path.length };
      }
      return best ? best.allow : true;
    },
  };
}

function matches(path: string, pattern: string): boolean {
  const re = new RegExp('^' + pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*').replace(/\\\$$/, '$'));
  return re.test(path);
}

const MAX_PAGE_CHARS = 500_000;
const REGEX_TIMEOUT_MS = 250;

export type Availability = 'open' | 'full' | 'unknown';

/** Infers availability from the public page text with the administrator-configured patterns. */
export function detectAvailability(html: string, openPattern: string | null, fullPattern: string | null): Availability {
  const text = html.slice(0, MAX_PAGE_CHARS).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const test = (p: string | null) => {
    if (!p) return false;
    let re: RegExp;
    try {
      re = new RegExp(p, 'iu');
    } catch {
      return text.toLowerCase().includes(p.toLowerCase());
    }
    // Patterns are typed by administrators: a pathological one (catastrophic backtracking) must not freeze the API.
    try {
      return vm.runInNewContext('re.test(text)', { re, text }, { timeout: REGEX_TIMEOUT_MS }) === true;
    } catch {
      return false;
    }
  };
  // "Complet" wins over generic open wording that may remain on the page.
  if (test(fullPattern)) return 'full';
  if (test(openPattern)) return 'open';
  return 'unknown';
}

export interface FetchLike {
  (url: string, init: { headers: Record<string, string>; signal: AbortSignal }): Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
}

/** Fetches public pages politely, caching robots.txt per host for an hour. */
export class PoliteFetcher {
  private readonly robots = new Map<string, { rules: RobotsRules; at: number }>();

  constructor(private readonly userAgent: string, private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike) {}

  async get(url: string): Promise<{ allowed: false } | { allowed: true; status: number; body: string }> {
    const u = new URL(url);
    const rules = await this.rulesFor(u);
    if (!rules.allows(u.pathname + u.search)) return { allowed: false };
    const res = await this.fetchImpl(url, { headers: { 'User-Agent': this.userAgent, Accept: 'text/html' }, signal: AbortSignal.timeout(15_000) });
    return { allowed: true, status: res.status, body: res.ok ? (await res.text()).slice(0, 2_000_000) : '' };
  }

  private async rulesFor(u: URL): Promise<RobotsRules> {
    const cached = this.robots.get(u.origin);
    if (cached && Date.now() - cached.at < 3_600_000) return cached.rules;
    let rules: RobotsRules;
    try {
      const res = await this.fetchImpl(`${u.origin}/robots.txt`, { headers: { 'User-Agent': this.userAgent }, signal: AbortSignal.timeout(10_000) });
      // 4xx: no robots.txt, crawling allowed. 5xx / network error: assume disallowed (RFC 9309).
      rules = res.ok ? parseRobots(await res.text(), this.userAgent) : res.status >= 500 ? { allows: () => false } : { allows: () => true };
    } catch {
      rules = { allows: () => false };
    }
    this.robots.set(u.origin, { rules, at: Date.now() });
    return rules;
  }
}
