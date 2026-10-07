'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ArrowRight, Bell, CalendarDays, Lightbulb, Timer } from 'lucide-react';
import { PLANS, SKILLS, type Skill } from '@c2pass/shared';
import { LineChart, Ring, SkillRadar } from '@/components/charts';
import { Badge, Card, CentreStatusBadge, ErrorNotice, LinkButton, Notice, PageHeader, Progress, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { date, dateTime, SKILL_META } from '@/lib/format';
import type { Dashboard } from '@/lib/types';

function DashboardView() {
  const welcome = useSearchParams().get('bienvenue');
  const { data, error, loading } = useLoad(() => api.get<Dashboard>('/dashboard'));
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorNotice error={error} />;

  const progress = Object.fromEntries(data.skills.map((s) => [s.skill, s.progress])) as Record<Skill, number>;
  const daysLeft = data.examDate ? Math.ceil((new Date(data.examDate).getTime() - Date.now()) / 86_400_000) : null;
  const q = data.quota;

  return (
    <>
      <PageHeader
        title={`Bonjour${data.firstName ? ` ${data.firstName}` : ''} 👋`}
        subtitle={daysLeft !== null && daysLeft >= 0 ? `Examen dans ${daysLeft} jour(s), le ${date(data.examDate)}. Objectif : ${data.target}.` : `Objectif : ${data.target} au TCF Canada.`}
        actions={<><LinkButton href="/entrainement" variant="secondary">S’entraîner</LinkButton><LinkButton href="/simulateur"><Timer className="h-4 w-4" />Lancer une simulation</LinkButton></>}
      />
      {welcome && <div className="mb-6"><Notice tone="ok" title="Bienvenue sur C2Pass !">Commencez par une simulation complète : elle mesure votre niveau actuel dans les 4 compétences et sert de point de départ à votre progression.</Notice></div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex items-center gap-6 lg:col-span-1">
          <Ring value={data.overallProgress} label="vers C2" />
          <div>
            <p className="text-sm text-muted">Progression globale</p>
            <p className="mt-1 text-sm">Moyenne de vos 4 compétences par rapport au seuil C2 (600/699 et 16/20).</p>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <div className="grid items-center gap-4 sm:grid-cols-[220px_1fr]">
            <SkillRadar values={progress} />
            <div className="space-y-3">
              {data.skills.map((s) => (
                <div key={s.skill}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{SKILL_META[s.skill].label}</span>
                    <span className="text-muted">{s.score !== null ? `${s.score}/${s.max}` : '—'} {s.cefr && <Badge className="ml-1">{s.cefr}</Badge>} {s.nclc ? <span className="ml-1 text-xs">NCLC {s.nclc}</span> : null}</span>
                  </div>
                  <Progress value={s.progress} color={SKILL_META[s.skill].color} className="mt-1" />
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-navy-900">Évolution sur vos simulations</p>
            <Link href="/scores" className="text-sm text-navy-700 underline">Tout voir</Link>
          </div>
          {data.history.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Aucune simulation terminée pour l’instant.</p>
          ) : (
            <LineChart
              labels={data.history.map((h) => date(h.completedAt, { day: 'numeric', month: 'short' }))}
              target={100}
              series={SKILLS.map((s) => ({ name: s, color: SKILL_META[s].color, values: data.history.map((h) => h.scores[s]?.progress ?? null) }))}
            />
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {SKILLS.map((s) => <span key={s} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: SKILL_META[s].color }} />{SKILL_META[s].label}</span>)}
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <p className="font-semibold text-navy-900">Votre offre : {PLANS[q.plan]?.name ?? q.plan}</p>
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <div className="flex justify-between"><span>Exercices aujourd’hui</span><span>{q.exercisesToday}{q.exercisesPerDay !== null ? ` / ${q.exercisesPerDay}` : ' · illimité'}</span></div>
                {q.exercisesPerDay !== null && <Progress value={(q.exercisesToday / q.exercisesPerDay) * 100} className="mt-1" />}
              </div>
              <div>
                <div className="flex justify-between"><span>Simulations ce mois</span><span>{q.simulationsThisMonth}{q.simulationsPerMonth !== null ? ` / ${q.simulationsPerMonth}` : ' · illimité'}</span></div>
                {q.simulationsPerMonth !== null && <Progress value={(q.simulationsThisMonth / q.simulationsPerMonth) * 100} color="var(--color-navy-700)" className="mt-1" />}
              </div>
            </div>
            {q.plan === 'free' && <LinkButton href="/tarifs" size="sm" className="mt-4 w-full">Passer à Premium</LinkButton>}
          </Card>
          <Card>
            <p className="flex items-center gap-2 font-semibold text-navy-900"><CalendarDays className="h-4 w-4 text-maple-600" />Prochaine session</p>
            {data.nextSession ? (
              <div className="mt-2 text-sm">
                <p className="font-medium">{data.nextSession.name}</p>
                <p className="text-muted">{data.nextSession.city} · {date(data.nextSession.nextSessionDate)}</p>
                <div className="mt-2 flex items-center gap-2"><CentreStatusBadge status={data.nextSession.status} />{data.nextSession.seatsLeft !== null && <span className="text-xs text-muted">{data.nextSession.seatsLeft} places</span>}</div>
              </div>
            ) : <p className="mt-2 text-sm text-muted">Aucune session annoncée dans votre pays.</p>}
            <Link href="/alertes" className="mt-3 flex items-center gap-1 text-sm font-medium text-navy-700">
              <Bell className="h-4 w-4" /> {data.unreadAlerts ? `${data.unreadAlerts} nouvelle(s) alerte(s)` : 'Gérer mes alertes'} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <p className="font-semibold text-navy-900">Entraînement par compétence</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {data.skills.map((s) => (
              <Link key={s.skill} href={`/entrainement/${s.skill}`} className="rounded-lg border border-line p-3 transition hover:border-navy-700">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{SKILL_META[s.skill].label}</span>
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {s.practice.answered} exercice(s){s.practice.accuracy !== null ? ` · ${s.practice.accuracy} % de réussite` : ''} · {s.practice.last7Days} cette semaine
                </p>
              </Link>
            ))}
          </div>
          {data.recent.length > 0 && (
            <>
              <p className="mt-5 text-sm font-semibold text-navy-900">Activité récente</p>
              <ul className="mt-2 divide-y divide-line text-sm">
                {data.recent.map((r, i) => (
                  <li key={i} className="flex items-center justify-between py-2">
                    <span>{r.kind === 'simulation' ? `Simulation ${r.label === 'full' ? 'complète' : 'de section'}` : `Exercice ${r.label}`}</span>
                    <span className="text-muted">
                      {r.kind === 'simulation' ? (r.score !== null ? `${r.score} % vers C2` : '') : r.score === 1 ? '✓ juste' : r.score === 0 ? '✗ faux' : 'corrigé'} · {dateTime(r.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card className="bg-gold-50/60">
          <p className="flex items-center gap-2 font-semibold text-navy-900"><Lightbulb className="h-4 w-4 text-gold-500" />Conseil du jour</p>
          <p className="mt-2 text-sm leading-relaxed">{data.tip}</p>
        </Card>
      </div>
    </>
  );
}

export default function DashboardPage() {
  return <Suspense><DashboardView /></Suspense>;
}
