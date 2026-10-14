import type { ReactNode } from 'react';
import { PublicFooter, PublicHeader } from '@/components/public-header';
import { LEGAL } from '@/lib/legal';

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="h-serif text-3xl font-bold text-navy-900">{title}</h1>
        <p className="mt-2 text-sm text-muted">Dernière mise à jour : {LEGAL.updatedAt}</p>
        <div className="legal mt-8 space-y-4 text-[15px] leading-relaxed text-ink">{children}</div>
      </main>
      <PublicFooter />
    </>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="pt-4 text-xl font-bold text-navy-900">{children}</h2>;
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1 pl-6">{children}</ul>;
}
