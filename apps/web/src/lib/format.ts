import type { Skill } from '@c2pass/shared';

export const SKILL_META: Record<Skill, { label: string; short: string; color: string; max: number }> = {
  CO: { label: 'Compréhension orale', short: 'CO', color: '#d52b1e', max: 699 },
  CE: { label: 'Compréhension écrite', short: 'CE', color: '#18375f', max: 699 },
  EE: { label: 'Expression écrite', short: 'EE', color: '#e0a526', max: 20 },
  EO: { label: 'Expression orale', short: 'EO', color: '#1e9e5a', max: 20 },
};

export function money(xaf: number) {
  return `${new Intl.NumberFormat('fr-FR').format(xaf)} FCFA`;
}

export function date(iso: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fr-FR', opts).format(new Date(iso));
}

export function dateTime(iso: string | Date | null | undefined) {
  return date(iso, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export const COUNTRY_NAMES: Record<string, string> = {
  CM: 'Cameroun', GA: 'Gabon', CG: 'Congo', TD: 'Tchad', CD: 'RDC', CF: 'RCA', GQ: 'Guinée Équatoriale',
};
