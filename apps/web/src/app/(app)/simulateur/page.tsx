'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle, BookOpen, Clock, Headphones, Lock, Mic, PenLine, Timer } from 'lucide-react';
import { EXAM_SECTIONS, type Skill } from '@c2pass/shared';
import { Badge, Button, Card, ErrorNotice, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import { dateTime, SKILL_META } from '@/lib/format';
import type { Dashboard, ExamState, SessionSummary } from '@/lib/types';

const ICONS = { CO: Headphones, CE: BookOpen, EE: PenLine, EO: Mic };
const STATUS: Record<SessionSummary['status'], [string, 'navy' | 'ok' | 'warn' | 'gray' | 'maple']> = {
  created: ['Prête', 'navy'], in_progress: ['En cours', 'warn'], evaluating: ['Correction en cours', 'warn'], completed: ['Terminée', 'ok'], abandoned: ['Abandonnée', 'gray'],
};

export default function SimulatorHome() {
  const router = useRouter();
  const sessions = useLoad(() => api.get<SessionSummary[]>('/simulator/sessions'));
  const dash = useLoad(() => api.get<Dashboard>('/dashboard'));
  const action = useAction();
  const [pending, setPending] = useState<string | null>(null);

  async function create(type: 'full' | 'section', skill?: Skill) {
    setPending(skill ?? 'full');
    const s = await action.run(() => api.post<ExamState>('/simulator/sessions', { type, skill }));
    setPending(null);
    if (s) router.push(`/examen/${s.id}`);
  }

  const q = dash.data?.quota;
  const total = EXAM_SECTIONS.reduce((a, s) => a + s.minutes, 0);

  return (
    <>
      <PageHeader title="Simulateur d’examen" subtitle="Les conditions réelles du TCF Canada : chronomètre verrouillé, écoute unique, pas de retour en arrière." />
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="bg-navy-900 text-white">
          <div className="flex items-center gap-2 text-gold-500"><Timer className="h-5 w-5" /><span className="text-sm font-semibold">Simulation complète</span></div>
          <p className="h-serif mt-2 text-2xl font-bold">Les 4 épreuves enchaînées · {Math.floor(total / 60)} h {total % 60} min</p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {EXAM_SECTIONS.map((s) => {
              const Icon = ICONS[s.skill];
              return (
                <div key={s.skill} className="rounded-lg bg-white/5 p-3">
                  <Icon className="h-4 w-4 text-maple-500" />
                  <p className="mt-1 font-semibold">{s.skill}</p>
                  <p className="text-xs text-navy-100/70">{s.items} {s.skill === 'CO' || s.skill === 'CE' ? 'questions' : 'tâches'} · {s.minutes} min</p>
                </div>
              );
            })}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => void create('full')} busy={pending === 'full'}>Préparer une simulation complète</Button>
            {q && <span className="text-sm text-navy-100/70">{q.simulationsPerMonth === null ? 'Simulations illimitées' : `${q.simulationsThisMonth} / ${q.simulationsPerMonth} utilisée(s) ce mois-ci`}</span>}
          </div>
        </Card>
        <Card>
          <p className="flex items-center gap-2 font-semibold text-navy-900"><AlertTriangle className="h-4 w-4 text-warn-600" />Avant de commencer</p>
          <ul className="mt-3 space-y-2 text-sm text-ink">
            <li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />Chaque section se ferme automatiquement à la fin du temps imparti.</li>
            <li className="flex gap-2"><Headphones className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />Utilisez des écouteurs. Chaque document sonore n’est diffusé qu’une fois.</li>
            <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />Une réponse validée est définitive. Le copier-coller est désactivé.</li>
            <li className="flex gap-2"><Mic className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />Autorisez le micro pour l’expression orale.</li>
          </ul>
        </Card>
      </div>

      <h2 className="mt-8 text-lg font-bold text-navy-900">Simuler une seule épreuve</h2>
      <p className="text-sm text-muted">Ne compte pas dans votre quota mensuel de simulations complètes.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {EXAM_SECTIONS.map((s) => {
          const Icon = ICONS[s.skill];
          return (
            <Card key={s.skill} className="p-4">
              <Icon className="h-5 w-5" style={{ color: SKILL_META[s.skill].color }} />
              <p className="mt-2 font-semibold">{SKILL_META[s.skill].label}</p>
              <p className="text-xs text-muted">{s.minutes} minutes</p>
              <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => void create('section', s.skill)} busy={pending === s.skill}>Lancer</Button>
            </Card>
          );
        })}
      </div>
      <div className="mt-4"><ErrorNotice error={action.error} /></div>

      <h2 className="mt-8 text-lg font-bold text-navy-900">Mes simulations</h2>
      {sessions.loading ? <Spinner /> : (
        <div className="mt-3 overflow-hidden rounded-xl border border-line bg-white">
          {(sessions.data ?? []).length === 0 && <p className="p-6 text-center text-sm text-muted">Aucune simulation pour l’instant.</p>}
          {(sessions.data ?? []).map((s) => {
            const [label, tone] = STATUS[s.status];
            const href = s.status === 'completed' || s.status === 'evaluating' || s.status === 'abandoned' ? `/resultats/${s.id}` : `/examen/${s.id}`;
            return (
              <Link key={s.id} href={href} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-navy-50">
                <div>
                  <p className="font-medium">{s.type === 'full' ? 'Simulation complète' : `Épreuve ${SKILL_META[s.skills[0]].label}`}</p>
                  <p className="text-xs text-muted">{dateTime(s.completedAt ?? s.startedAt ?? s.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {s.skills.map((k) => s.scores[k]?.score != null && <Badge key={k} tone="gray">{k} {s.scores[k]!.score}</Badge>)}
                  <Badge tone={tone}>{label}</Badge>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
