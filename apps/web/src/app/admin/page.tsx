'use client';

import { useState } from 'react';
import { PLANS, type PlanId } from '@c2pass/shared';
import { Button, Card, ErrorNotice, Field, Input, PageHeader, Select, Spinner, Stat } from '@/components/ui';
import { RequireAuth } from '@/components/require-auth';
import { api } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import { money } from '@/lib/format';

const CHANNELS: Record<string, string> = {
  facebook_instagram: 'Facebook / Instagram', google: 'Google', tiktok: 'TikTok', influenceurs: 'Influenceurs',
  radio_tv: 'Radio / TV', affichage: 'Affichage', partenariats: 'Partenariats', autre: 'Autre',
};
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

interface Kpis {
  months: { month: string; spend: number; signups: number; newPayers: number; revenue: number; cac: number | null }[];
  totals: { spend: number; newPayers: number; signups: number; cac: number | null; ltv: number | null; ltvToCac: number | null; customers: number };
}
interface Spend { id: string; month: string; channel: string; amountXaf: number; note: string | null }

/** CAC vs LTV (cahier des charges p. 24), from the marketing spend entered here. */
function Acquisition() {
  const kpis = useLoad(() => api.get<Kpis>('/admin/marketing/kpis'));
  const spend = useLoad(() => api.get<Spend[]>('/admin/marketing/spend'));
  const action = useAction();
  const [f, setF] = useState({ month: new Date().toISOString().slice(0, 7), channel: 'facebook_instagram', amount: '', note: '' });
  const reload = () => { void kpis.reload(); void spend.reload(); };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const ok = await action.run(() => api.post('/admin/marketing/spend', { month: f.month, channel: f.channel, amountXaf: Number(f.amount), note: f.note.trim() || undefined }));
    if (ok) { setF({ ...f, amount: '', note: '' }); reload(); }
  }

  const t = kpis.data?.totals;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-navy-900">Acquisition : CAC et LTV</h2>
      <p className="text-sm text-muted">Coût d’acquisition d’un client payant (dépenses marketing ÷ nouveaux payants) comparé à ce qu’un client rapporte (encaissements nets ÷ clients payants). Un rapport LTV/CAC de 3 ou plus est sain.</p>
      {kpis.loading ? <Spinner /> : !kpis.data || !t ? <ErrorNotice error={kpis.error} /> : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="CAC (12 mois)" value={t.cac === null ? '—' : money(t.cac)} hint={`${money(t.spend)} dépensés · ${t.newPayers} nouveaux payants`} />
            <Stat label="LTV" value={t.ltv === null ? '—' : money(t.ltv)} hint={`sur ${t.customers} client(s) payant(s)`} />
            <Stat label="LTV / CAC" value={t.ltvToCac === null ? '—' : `${t.ltvToCac.toLocaleString('fr-FR')} ×`} hint={t.ltvToCac === null ? 'saisissez les dépenses ci-dessous' : t.ltvToCac >= 3 ? 'rentable' : 'acquisition trop chère'} />
            <Stat label="Inscrits (12 mois)" value={t.signups} hint={t.signups ? `${Math.round((t.newPayers / t.signups) * 1000) / 10} % deviennent payants` : undefined} />
          </div>
          <Card className="mt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted"><tr><th className="py-2">Mois</th><th className="text-right">Dépenses</th><th className="text-right">Inscrits</th><th className="text-right">Nouveaux payants</th><th className="text-right">Encaissé</th><th className="text-right">CAC</th></tr></thead>
                <tbody>{kpis.data.months.slice().reverse().map((m) => (
                  <tr key={m.month} className="border-t border-line">
                    <td className="py-2">{monthLabel(m.month)}</td>
                    <td className="text-right">{m.spend ? money(m.spend) : '—'}</td>
                    <td className="text-right">{m.signups}</td>
                    <td className="text-right">{m.newPayers}</td>
                    <td className="text-right">{m.revenue ? money(m.revenue) : '—'}</td>
                    <td className="text-right font-semibold">{m.cac === null ? '—' : money(m.cac)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      <Card className="mt-4">
        <p className="font-semibold text-navy-900">Dépenses marketing</p>
        <form onSubmit={add} className="mt-3 grid gap-3 sm:grid-cols-5 sm:items-end">
          <Field label="Mois"><Input type="month" required value={f.month} onChange={(e) => setF({ ...f, month: e.target.value })} /></Field>
          <Field label="Canal">
            <Select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>{Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          </Field>
          <Field label="Montant (FCFA)"><Input type="number" min={1} required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Note"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="ex. campagne rentrée" /></Field>
          <Button type="submit" busy={action.busy}>Ajouter</Button>
        </form>
        <div className="mt-3"><ErrorNotice error={action.error} /></div>
        {spend.data && spend.data.length > 0 && (
          <ul className="mt-3 divide-y divide-line text-sm">
            {spend.data.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <span>{monthLabel(s.month)} · {CHANNELS[s.channel] ?? s.channel}{s.note ? ` · ${s.note}` : ''}</span>
                <span className="flex items-center gap-3"><b>{money(s.amountXaf)}</b><Button size="sm" variant="ghost" onClick={() => void action.run(() => api.del(`/admin/marketing/spend/${s.id}`)).then(reload)}>Supprimer</Button></span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

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
      <Acquisition />
    </>
  );
}

export default function AdminHome() {
  return <RequireAuth roles={['admin']}><StatsView /></RequireAuth>;
}
