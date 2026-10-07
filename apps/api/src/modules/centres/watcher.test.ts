import { describe, expect, it } from 'vitest';
import { detectAvailability, parseRobots } from './watcher.js';

describe('robots.txt', () => {
  const txt = `User-agent: *\nDisallow: /private/\nAllow: /private/tcf\n\nUser-agent: C2PassVeille\nDisallow: /`;
  it('applies the group for our agent when present', () => {
    expect(parseRobots(txt, 'C2PassVeille/1.0 (+https://c2pass.cm)').allows('/tcf')).toBe(false);
  });
  it('falls back to * with longest-match precedence', () => {
    const r = parseRobots(txt, 'OtherBot/1.0');
    expect(r.allows('/private/x')).toBe(false);
    expect(r.allows('/private/tcf/juin')).toBe(true);
    expect(r.allows('/public')).toBe(true);
  });
  it('treats an empty Disallow as allow-all', () => {
    expect(parseRobots('User-agent: *\nDisallow:', 'x').allows('/anything')).toBe(true);
  });
});

describe('availability detection', () => {
  it('prefers "complet" over generic open wording', () => {
    expect(detectAvailability('<p>Inscriptions ouvertes</p><b>Session COMPLÈTE</b>', 'inscriptions ouvertes', 'compl[eè]te?')).toBe('full');
    expect(detectAvailability('<p>Inscriptions ouvertes</p>', 'inscriptions ouvertes', 'complet')).toBe('open');
    expect(detectAvailability('<script>complet</script><p>Bientôt</p>', 'ouvert', 'complet')).toBe('unknown');
  });
});
