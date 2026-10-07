'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Info, Loader2, Lock } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { CENTRE_STATUS_LABELS, type CentreStatus } from '@c2pass/shared';
import { ApiError } from '@/lib/api';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'navy';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-maple-600 text-white hover:bg-maple-700 shadow-sm',
  navy: 'bg-navy-900 text-white hover:bg-navy-800 shadow-sm',
  secondary: 'bg-white text-navy-900 border border-line hover:bg-navy-50',
  ghost: 'text-navy-800 hover:bg-navy-50',
  danger: 'bg-white text-maple-700 border border-maple-500/40 hover:bg-maple-50',
};
const SIZES = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base' };

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function buttonClass(variant: Variant = 'primary', size: keyof typeof SIZES = 'md', extra?: string) {
  return cx('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50', VARIANTS[variant], SIZES[size], extra);
}

export function Button({ variant = 'primary', size = 'md', busy, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: keyof typeof SIZES; busy?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={busy || props.disabled} {...props}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function LinkButton({ href, variant = 'primary', size = 'md', className, children }: { href: string; variant?: Variant; size?: keyof typeof SIZES; className?: string; children: ReactNode }) {
  return <Link href={href} className={buttonClass(variant, size, className)}>{children}</Link>;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="h-serif text-2xl font-bold text-navy-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const BADGE_TONES = {
  navy: 'bg-navy-100 text-navy-800',
  maple: 'bg-maple-50 text-maple-700',
  ok: 'bg-ok-50 text-ok-600',
  warn: 'bg-warn-50 text-warn-600',
  gold: 'bg-gold-50 text-[#9a6c0b]',
  gray: 'bg-slate-100 text-slate-600',
};
export function Badge({ tone = 'navy', children, className }: { tone?: keyof typeof BADGE_TONES; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', BADGE_TONES[tone], className)}>{children}</span>;
}

const STATUS_TONE: Record<CentreStatus, keyof typeof BADGE_TONES> = { open: 'ok', closed: 'gray', full: 'maple', soon: 'warn' };
export function CentreStatusBadge({ status }: { status: CentreStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]}>
      <span className={cx('h-1.5 w-1.5 rounded-full', status === 'open' ? 'bg-ok-600 animate-pulse' : status === 'full' ? 'bg-maple-600' : status === 'soon' ? 'bg-warn-600' : 'bg-slate-400')} />
      {CENTRE_STATUS_LABELS[status]}
    </Badge>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-navy-900">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-maple-700">{error}</span>}
    </label>
  );
}

const inputBase = 'rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-navy-700 focus:ring-2 focus:ring-navy-100 disabled:bg-slate-50';
/** Full width unless the caller sets its own width. */
const width = (className?: string) => (/(^|\s)w-/.test(className ?? '') ? '' : 'w-full');
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputBase, width(props.className), 'h-10', props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputBase, width(props.className), 'h-10', props.className)} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputBase, width(props.className), 'py-2 leading-relaxed', props.className)} />;
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'ok' | 'warn' | 'error'; title?: string; children?: ReactNode }) {
  const styles = {
    info: ['border-navy-100 bg-navy-50 text-navy-800', Info],
    ok: ['border-ok-600/20 bg-ok-50 text-ok-600', CheckCircle2],
    warn: ['border-warn-600/20 bg-warn-50 text-warn-600', AlertTriangle],
    error: ['border-maple-500/30 bg-maple-50 text-maple-700', AlertTriangle],
  } as const;
  const [cls, Icon] = styles[tone];
  return (
    <div className={cx('flex gap-3 rounded-lg border p-3 text-sm', cls)} role={tone === 'error' ? 'alert' : undefined}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
      </div>
    </div>
  );
}

/** API error display; a 402 (plan limit) offers the upgrade instead of a bare error. */
export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  if (error instanceof ApiError && error.status === 402) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold-500/40 bg-gold-50 p-3 text-sm text-[#7a560a]">
        <span className="flex items-center gap-2"><Lock className="h-4 w-4" />{error.message}</span>
        <LinkButton href="/tarifs" size="sm">Voir les offres</LinkButton>
      </div>
    );
  }
  const message = error instanceof ApiError
    ? error.code === 'validation_failed' ? validationMessage(error) : error.message
    : 'Connexion impossible au serveur. Réessayez dans un instant.';
  return <Notice tone="error">{message}</Notice>;
}

const FIELD_NAMES: Record<string, string> = {
  email: 'E-mail', password: 'Mot de passe', firstName: 'Prénom', lastName: 'Nom', phone: 'Téléphone', whatsapp: 'WhatsApp',
  acceptTerms: 'Conditions', code: 'Code', next: 'Nouveau mot de passe', name: 'Nom', city: 'Ville', statement: 'Énoncé',
};

function validationMessage(e: ApiError) {
  const issues = e.details as { path?: (string | number)[]; message: string }[] | undefined;
  if (Array.isArray(issues) && issues.length) return issues.map((i) => (i.path?.length ? `${FIELD_NAMES[String(i.path[0])] ?? i.path[0]} : ` : '') + i.message).join(' · ');
  return e.message;
}

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}

export function Progress({ value, color = 'var(--color-maple-600)', className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
      {icon && <div className="text-slate-400">{icon}</div>}
      <p className="font-semibold text-navy-900">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-navy-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
