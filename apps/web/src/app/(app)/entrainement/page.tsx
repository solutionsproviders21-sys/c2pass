'use client';

import Link from 'next/link';
import { ArrowRight, BookOpen, Headphones, Mic, PenLine } from 'lucide-react';
import { LEVELS, type Skill } from '@c2pass/shared';
import { Badge, Card, ErrorNotice, PageHeader, Progress, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { SKILL_META } from '@/lib/format';
import type { Course } from '@/lib/types';

interface Overview {
  quota: { perDay: number | null; usedToday: number };
  skills: { skill: Skill; questions: Record<string, number>; answered: number; correct: number }[];
}

const ICONS = { CO: Headphones, CE: BookOpen, EE: PenLine, EO: Mic };
const DESCRIPTIONS: Record<Skill, string> = {
  CO: 'Dialogues, annonces, interviews : écoutez puis répondez. En entraînement, la réécoute est autorisée.',
  CE: 'Textes courants, articles, extraits littéraires : identifiez l’information, le ton et l’intention.',
  EE: 'Message, article, texte argumenté : la correction IA analyse lexique, connecteurs et structures.',
  EO: 'Entretien, interaction, point de vue : enregistrez-vous et recevez une note sur 20.',
};

export default function TrainingHome() {
  const overview = useLoad(() => api.get<Overview>('/training/overview'));
  const courses = useLoad(() => api.get<Course[]>('/courses'));
  if (overview.loading) return <Spinner />;
  if (overview.error || !overview.data) return <ErrorNotice error={overview.error} />;
  const { quota, skills } = overview.data;

  return (
    <>
      <PageHeader
        title="Entraînement thématique"
        subtitle="Choisissez une compétence et un niveau. Chaque réponse est corrigée immédiatement, avec l’explication."
        actions={quota.perDay !== null ? <Badge tone={quota.usedToday >= quota.perDay ? 'maple' : 'navy'} className="text-sm">{quota.usedToday} / {quota.perDay} exercices aujourd’hui</Badge> : <Badge tone="gold" className="text-sm">Exercices illimités</Badge>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {skills.map((s) => {
          const Icon = ICONS[s.skill];
          const total = Object.values(s.questions).reduce((a, b) => a + b, 0);
          const mcq = s.skill === 'CO' || s.skill === 'CE';
          return (
            <Card key={s.skill} className="flex flex-col">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg" style={{ background: `${SKILL_META[s.skill].color}18`, color: SKILL_META[s.skill].color }}><Icon className="h-5 w-5" /></span>
                <div className="flex-1">
                  <p className="font-semibold text-navy-900">{SKILL_META[s.skill].label}</p>
                  <p className="mt-0.5 text-sm text-muted">{DESCRIPTIONS[s.skill]}</p>
                </div>
              </div>
              {mcq && s.answered > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted"><span>{s.answered} réponses</span><span>{Math.round((s.correct / s.answered) * 100)} % de réussite</span></div>
                  <Progress value={(s.correct / s.answered) * 100} color={SKILL_META[s.skill].color} className="mt-1" />
                </div>
              )}
              {!mcq && <p className="mt-4 text-xs text-muted">{s.answered} production(s) corrigée(s) · {total} sujets disponibles</p>}
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Link href={`/entrainement/${s.skill}`} className="rounded-md bg-navy-900 px-2.5 py-1 text-xs font-semibold text-white">Tous niveaux</Link>
                {LEVELS.map((l) => s.questions[l] ? (
                  <Link key={l} href={`/entrainement/${s.skill}?niveau=${l}`} className="rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-navy-800 hover:border-navy-700">{l}</Link>
                ) : null)}
              </div>
            </Card>
          );
        })}
      </div>

      <h2 className="h-serif mt-10 text-xl font-bold text-navy-900">Fiches de méthode</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(courses.data ?? []).map((c) => (
          <Link key={c.id} href={`/fiches/${c.id}`} className="group rounded-xl border border-line bg-white p-4 transition hover:border-navy-700">
            <div className="flex items-center gap-2"><Badge tone={c.skill === 'GRAM' ? 'gold' : 'navy'}>{c.skill === 'GRAM' ? 'Grammaire' : c.skill}</Badge><Badge tone="gray">{c.level}</Badge></div>
            <p className="mt-2 font-semibold text-navy-900">{c.title}</p>
            <p className="mt-1 line-clamp-2 text-sm text-muted">{c.summary}</p>
            <p className="mt-2 flex items-center gap-1 text-sm font-medium text-maple-600">Lire <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></p>
          </Link>
        ))}
      </div>
    </>
  );
}
