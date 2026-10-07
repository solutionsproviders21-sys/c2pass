'use client';

import Link from 'next/link';
import { SKILLS } from '@c2pass/shared';
import { LineChart } from '@/components/charts';
import { Badge, Card, Empty, ErrorNotice, LinkButton, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { date, dateTime, SKILL_META } from '@/lib/format';
import type { SessionSummary } from '@/lib/types';

interface History {
  writings: { id: string; task: number; status: string; score: number | null; wordCount: number; createdAt: string }[];
  recordings: { id: string; task: number; status: string; score: number | null; createdAt: string }[];
}

export default function ScoresPage() {
  const sessions = useLoad(() => api.get<SessionSummary[]>('/simulator/sessions'));
  const history = useLoad(() => api.get<History>('/training/history'));
  if (sessions.loading) return <Spinner />;
  if (sessions.error) return <ErrorNotice error={sessions.error} />;
  const done = (sessions.data ?? []).filter((s) => s.status === 'completed').slice().reverse();

  return (
    <>
      <PageHeader title="Mes scores" subtitle="Échelle officielle : 100–699 en compréhension, 0–20 en expression. Seuil C2 : 600 et 16." />
      {done.length === 0 ? (
        <Empty title="Aucune simulation terminée">Passez une simulation pour obtenir votre premier score officiel estimé.<div className="mt-3"><LinkButton href="/simulateur">Aller au simulateur</LinkButton></div></Empty>
      ) : (
        <>
          <Card>
            <p className="font-semibold text-navy-900">Progression vers C2 (%)</p>
            <LineChart
              labels={done.map((s) => date(s.completedAt, { day: 'numeric', month: 'short' }))}
              target={100}
              series={SKILLS.map((k) => ({ name: k, color: SKILL_META[k].color, values: done.map((s) => s.scores[k]?.progress ?? null) }))}
            />
          </Card>
          <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-white">
            <table className="w-full text-sm">
              <thead className="bg-navy-50 text-left text-xs uppercase tracking-wide text-muted">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Type</th>{SKILLS.map((k) => <th key={k} className="px-4 py-3">{k}</th>)}<th className="px-4 py-3">Vers C2</th></tr>
              </thead>
              <tbody>
                {done.slice().reverse().map((s) => (
                  <tr key={s.id} className="border-t border-line hover:bg-navy-50">
                    <td className="px-4 py-3"><Link href={`/resultats/${s.id}`} className="font-medium text-navy-700 underline">{dateTime(s.completedAt)}</Link></td>
                    <td className="px-4 py-3">{s.type === 'full' ? 'Complète' : 'Section'}</td>
                    {SKILLS.map((k) => {
                      const sc = s.scores[k];
                      return <td key={k} className="px-4 py-3">{sc?.score != null ? <>{sc.score} <Badge tone="gray">{sc.cefr}</Badge></> : '—'}</td>;
                    })}
                    <td className="px-4 py-3 font-semibold">{s.totalScore != null ? `${s.totalScore} %` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {history.data && (history.data.writings.length > 0 || history.data.recordings.length > 0) && (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card>
            <p className="font-semibold text-navy-900">Productions écrites (entraînement)</p>
            <ul className="mt-2 divide-y divide-line text-sm">
              {history.data.writings.map((w) => (
                <li key={w.id} className="flex justify-between py-2"><span>Tâche {w.task} · {w.wordCount} mots</span><span className="text-muted">{w.score !== null ? `${w.score}/20` : w.status} · {date(w.createdAt, { day: 'numeric', month: 'short' })}</span></li>
              ))}
            </ul>
          </Card>
          <Card>
            <p className="font-semibold text-navy-900">Productions orales (entraînement)</p>
            <ul className="mt-2 divide-y divide-line text-sm">
              {history.data.recordings.map((r) => (
                <li key={r.id} className="flex justify-between py-2"><span>Tâche {r.task}</span><span className="text-muted">{r.score !== null ? `${r.score}/20` : r.status === 'awaiting_review' ? 'chez le correcteur' : r.status} · {date(r.createdAt, { day: 'numeric', month: 'short' })}</span></li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
