'use client';

/**
 * Lightweight browser fingerprint used for exam anti-fraud (detecting several accounts on one device).
 * No third-party script; only stable, non-sensitive properties are hashed.
 */
let cached: Promise<string> | null = null;

export function fingerprint(): Promise<string> {
  cached ??= (async () => {
    const parts = [
      navigator.userAgent, navigator.language, (navigator.languages ?? []).join(','), String(navigator.hardwareConcurrency ?? ''),
      `${screen.width}x${screen.height}x${screen.colorDepth}`, Intl.DateTimeFormat().resolvedOptions().timeZone, String(navigator.maxTouchPoints ?? ''),
    ];
    try {
      const c = document.createElement('canvas');
      const g = c.getContext('2d');
      if (g) {
        g.textBaseline = 'top';
        g.font = '14px Arial';
        g.fillText('C2Pass – TCF Canada 🍁', 2, 2);
        parts.push(c.toDataURL());
      }
    } catch {
      /* canvas blocked */
    }
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('|')));
    return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
  })();
  return cached;
}
