'use client';

import { PLANS, type PlanId } from '@c2pass/shared';
import { Card, ErrorNotice, PageHeader, Spinner, Stat } from '@/components/ui';
import { RequireAuth } from '@/components/require-auth';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { money } from '@/lib/format';

interface Stats {
  users: number; students: number; dau: number; mau: number; stickiness: number;
  simulations: { started: number; completed: number; completionRate: number };
  c2Rate: number; payingUsers: number; conversionRate: number;
  byPlan: { plan_id: PlanId; n: number }[]; mrr: number; arpu: number;
  revenue: { last30: number; total: number }; signups: { day: string; n: number }[];
}

function StatsView() {
  const { data, error, loading } = useLoad(() => api.get<Stats>('/admin/stats'));
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorNotice error={error} />;
  const max = Math.max(1, ...data.signups.map((s) => s.n));
  return (
    <>
      <PageHeader title="Indicateurs clés" subtitle="Suivi des objectifs du cahier des charges (§12)." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Utilisateurs actifs / jour" value={data.dau} hint={`${data.mau} sur 30 jours · ${data.stickiness} % de rétention`} />
        <Stat label="Taux de complétion" value={`${data.simulations.completionRate} %`} hint={`${data.simulations.completed} / ${data.simulations.started} simulations complètes`} />
        <Stat label="Candidats au niveau C2" value={`${data.c2Rate} %`} hint="au moins une compétence ≥ seuil C2" />
        <Stat label="Conversion Premium" value={`${data.conversionRate} %`} hint={`${data.payingUsers} abonnés sur ${data.students} étudiants`} />
        <Stat label="MRR" value={money(data.mrr)} hint="revenu mensuel récurrent estimé" />
        <Stat label="ARPU" value={money(data.arpu)} hint="par abonné payant" />
        <Stat label="Encaissé (30 j)" value={money(data.revenue.last30)} hint={`${money(data.revenue.total)} au total`} />
        <Stat label="Comptes" value={data.users} hint={`${data.students} étudiants`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <p className="font-semibold text-navy-900">Inscriptions (30 derniers jours)</p>
          <div className="mt-4 flex h-40 items-end gap-1">
            {data.signups.length === 0 && <p className="text-sm text-muted">Aucune inscription récente.</p>}
            {data.signups.map((s) => (
              <div key={s.day} className="group relative flex-1">
                <div className="rounded-t bg-navy-700 transition group-hover:bg-maple-600" style={{ height: `${(s.n / max) * 150}px` }} />
                <span className="absolute -top-5 left-1/2 hidden -translate-x-1/2 text-xs group-hover:block">{s.n}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <p className="font-semibold text-navy-900">Abonnés par offre</p>
          <ul className="mt-3 space-y-2 text-sm">
            {(['standard', 'pro', 'reussite'] as PlanId[]).map((p) => (
              <li key={p} className="flex justify-between"><span>{PLANS[p].name}</span><b>{data.byPlan.find((b) => b.plan_id === p)?.n ?? 0}</b></li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

export default function AdminHome() {
  return <RequireAuth roles={['admin']}><StatsView /></RequireAuth>;
}
