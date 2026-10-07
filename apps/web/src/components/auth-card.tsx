'use client';

import type { ReactNode } from 'react';
import { useLoad } from '@/lib/hooks';
import { api } from '@/lib/api';
import { Logo, MapleLeaf } from './logo';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <MapleLeaf className="absolute -bottom-20 -right-20 h-[420px] w-[420px] text-white/[0.05]" />
        <Logo light />
        <div className="relative">
          <p className="h-serif text-3xl font-bold leading-snug">« J’ai eu C2 en compréhension orale après 6 simulations. L’écoute unique m’a appris à tout lire avant d’écouter. »</p>
          <p className="mt-4 text-navy-100/70">Aïcha, Douala · TCF Canada, session de juin</p>
        </div>
        <p className="relative text-xs text-navy-100/50">Témoignage illustratif.</p>
      </div>
      <div className="flex flex-col items-center justify-center px-4 py-10">
        <div className="mb-8 lg:hidden"><Logo /></div>
        <div className="w-full max-w-md">
          <h1 className="h-serif text-3xl font-bold text-navy-900">{title}</h1>
          {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function OAuthButtons() {
  const { data } = useLoad(() => api.get<{ oauth: string[] }>('/auth/providers'));
  const providers = data?.oauth ?? [];
  if (!providers.length) return null;
  return (
    <div className="space-y-2">
      {providers.includes('google') && (
        <a href="/api/auth/oauth/google/start" className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white text-sm font-semibold hover:bg-navy-50">
          <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>
          Continuer avec Google
        </a>
      )}
      {providers.includes('facebook') && (
        <a href="/api/auth/oauth/facebook/start" className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#1877F2] text-sm font-semibold text-white hover:opacity-90">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="white"><path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4h-3V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg>
          Continuer avec Facebook
        </a>
      )}
      <div className="flex items-center gap-3 py-2 text-xs text-muted"><span className="h-px flex-1 bg-line" />ou avec votre e-mail<span className="h-px flex-1 bg-line" /></div>
    </div>
  );
}

export function AuthFooter({ children }: { children: ReactNode }) {
  return <p className="mt-6 text-center text-sm text-muted">{children}</p>;
}

