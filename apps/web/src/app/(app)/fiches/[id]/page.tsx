'use client';

import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Badge, Card, ErrorNotice, LinkButton, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import type { CourseDetail } from '@/lib/types';

export default function CoursePage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading } = useLoad(() => api.get<CourseDetail>(`/courses/${encodeURIComponent(id)}`), [id]);
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorNotice error={error} />;
  return (
    <article className="mx-auto max-w-3xl">
      <LinkButton href="/entrainement" variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" />Entraînement</LinkButton>
      <div className="mt-4 flex gap-2"><Badge>{data.skill === 'GRAM' ? 'Grammaire' : data.skill}</Badge><Badge tone="gray">{data.level}</Badge></div>
      <h1 className="h-serif mt-2 text-3xl font-bold text-navy-900">{data.title}</h1>
      <p className="mt-2 text-lg text-muted">{data.summary}</p>
      <div className="mt-8 space-y-6">
        {data.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-lg font-bold text-navy-900">{s.heading}</h2>
            <div className="prose-c2 mt-1 whitespace-pre-line text-[15px]">{s.body}</div>
          </section>
        ))}
      </div>
      {data.lexicon.length > 0 && (
        <Card className="mt-8">
          <p className="font-semibold text-navy-900">Lexique C1–C2</p>
          <dl className="mt-3 divide-y divide-line">
            {data.lexicon.map((l) => (
              <div key={l.term} className="py-2 text-sm">
                <dt className="font-semibold text-maple-700">{l.term}</dt>
                <dd>{l.definition}</dd>
                <dd className="italic text-muted">« {l.example} »</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}
    </article>
  );
}
