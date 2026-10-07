'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { SKILLS, type Skill } from '@c2pass/shared';
import { Ring } from '@/components/charts';
import { FeedbackPanel, ScorePill } from '@/components/feedback';
import { Badge, Card, cx, ErrorNotice, LinkButton, Notice, PageHeader, Progress, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { dateTime, SKILL_META } from '@/lib/format';
import type { ExamResult, McqReview, TaskReview } from '@/lib/types';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading, reload } = useLoad(() => api.get<ExamResult>(`/simulator/sessions/${id}/result`), [id]);
  const [tab, setTab] = useState<Skill | null>(null);

  // While the AI is still grading, refresh every few seconds.
  useEffect(() => {
    if (data?.status !== 'evaluating') return;
    const t = setInterval(() => void reload(), 4000);
    return () => clearInterval(t);
  }, [data?.status, reload]);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorNotice error={error} />;

  const skills = SKILLS.filter((s) => data.review[s]);
  const active = tab ?? skills[0];
  const items = data.review[active] ?? [];

  return (
    <>
      <LinkButton href="/simulateur" variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" />Simulateur</LinkButton>
      <PageHeader
        title={data.type === 'full' ? 'Résultats de la simulation' : `Résultat : ${SKILL_META[skills[0]].label}`}
        subtitle={data.completedAt ? `Terminée le ${dateTime(data.completedAt)}` : undefined}
      />
      {data.status === 'evaluating' && <div className="mb-4"><Notice tone="info" title="Correction en cours">Vos productions écrites et orales sont en cours d’évaluation. Cette page se met à jour automatiquement.</Notice></div>}
      {data.status === 'abandoned' && <div className="mb-4"><Notice tone="warn">Simulation abandonnée : seules les sections terminées ont été notées.</Notice></div>}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="flex flex-col items-center justify-center text-center">
          <Ring value={data.totalScore ?? 0} size={140} label="vers C2" />
          <p className="mt-2 text-sm text-muted">Moyenne des compétences notées, rapportée au seuil C2.</p>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2">
          {skills.map((s) => {
            const sc = data.scores[s];
            return (
              <Card key={s} className="p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">{SKILL_META[s].label}</p>
                  {sc?.cefr && <Badge className="text-sm">{sc.cefr}</Badge>}
                </div>
                <p className="mt-2 text-3xl font-bold text-navy-900">{sc?.score ?? '—'}<span className="text-base font-medium text-muted"> / {SKILL_META[s].max}</span></p>
                <p className="text-xs text-muted">{sc?.nclc ? `NCLC ${sc.nclc}` : sc?.pending ? 'En attente du correcteur' : data.status === 'evaluating' ? 'Correction en cours' : ''}</p>
                <Progress value={sc?.progress ?? 0} color={SKILL_META[s].color} className="mt-3" />
              </Card>
            );
          })}
        </div>
      </div>

      <h2 className="mt-8 text-lg font-bold text-navy-900">Correction détaillée</h2>
      <div className="mt-3 flex flex-wrap gap-1">
        {skills.map((s) => (
          <button key={s} onClick={() => setTab(s)} className={cx('rounded-lg px-4 py-2 text-sm font-semibold', active === s ? 'bg-navy-900 text-white' : 'border border-line bg-white text-navy-800')}>{SKILL_META[s].label}</button>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {(active === 'CO' || active === 'CE')
          ? (items as McqReview[]).map((q, i) => <McqItem key={q.id} q={q} n={i + 1} />)
          : (items as TaskReview[]).map((t) => <TaskItem key={t.id} t={t} skill={active} />)}
      </div>
    </>
  );
}

function McqItem({ q, n }: { q: McqReview; n: number }) {
  return (
    <details className="rounded-xl border border-line bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
        {q.choice === null ? <span className="h-5 w-5 rounded-full border-2 border-slate-300" /> : q.correct ? <CheckCircle2 className="h-5 w-5 text-ok-600" /> : <XCircle className="h-5 w-5 text-maple-600" />}
        <span className="text-sm font-semibold text-muted">Q{n}</span>
        <Badge tone="gray">{q.level}</Badge>
        <span className="flex-1 truncate text-sm">{q.statement}</span>
        <span className="text-xs text-muted">{q.choice === null ? 'Sans réponse' : `Votre réponse : ${LETTERS[q.choice]}`}</span>
      </summary>
      <div className="space-y-3 border-t border-line p-4 text-sm">
        {q.context && <p className="whitespace-pre-line rounded bg-navy-50 p-3">{q.context}</p>}
        {q.transcript && <p className="whitespace-pre-line rounded bg-navy-50 p-3"><b>Transcription : </b>{q.transcript}</p>}
        <ul className="space-y-1">
          {q.options.map((o, i) => (
            <li key={i} className={cx('rounded px-2 py-1', i === q.correctAnswer ? 'bg-ok-50 font-medium text-ok-600' : i === q.choice ? 'bg-maple-50 text-maple-700 line-through' : '')}>{LETTERS[i]}. {o}</li>
          ))}
        </ul>
        {q.explanation && <p className="rounded bg-gold-50 p-3">{q.explanation}</p>}
      </div>
    </details>
  );
}

function TaskItem({ t, skill }: { t: TaskReview; skill: Skill }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-navy-900">Tâche {t.task}</p>
        <ScorePill score={t.score} />
      </div>
      <p className="mt-1 whitespace-pre-line text-sm text-muted">{t.statement}</p>
      {skill === 'EE' && (
        t.text ? <div className="mt-3 whitespace-pre-line rounded-lg bg-navy-50 p-3 text-sm leading-relaxed">{t.text}<p className="mt-2 text-xs text-muted">{t.wordCount} mots</p></div>
          : <p className="mt-3 text-sm text-maple-700">Tâche non traitée.</p>
      )}
      {skill === 'EO' && (
        t.status === 'missing' ? <p className="mt-3 text-sm text-maple-700">Aucun enregistrement.</p>
          : t.transcription && <div className="mt-3 rounded-lg bg-navy-50 p-3 text-sm"><b>Transcription : </b>{t.transcription}</div>
      )}
      {(t.feedback || t.humanReview || t.status === 'awaiting_review') && <div className="mt-4"><FeedbackPanel feedback={t.feedback} humanReview={t.humanReview} status={t.status} /></div>}
    </Card>
  );
}
