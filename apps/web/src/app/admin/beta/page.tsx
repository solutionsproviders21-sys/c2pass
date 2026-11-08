'use client';

import { useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { Badge, Button, Card, ErrorNotice, Field, Input, Notice, PageHeader, Spinner } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import { date } from '@/lib/format';
import type { Invite, Lead } from '@/lib/types';

function inviteState(i: Invite): [string, 'ok' | 'gray' | 'warn'] {
  if (i.revokedAt) return ['Révoquée', 'gray'];
  if (i.expiresAt && new Date(i.expiresAt) < new Date()) return ['Expirée', 'gray'];
  if (i.uses >= i.maxUses) return ['Utilisée', 'warn'];
  return ['Active', 'ok'];
}

function Invites() {
  const list = useLoad(() => api.get<Invite[]>('/admin/invites'));
  const action = useAction();
  const [f, setF] = useState({ count: '10', maxUses: '1', note: '', expiresInDays: '30' });
  const [created, setCreated] = useState<string[]>([]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const codes = await action.run(() => api.post<string[]>('/admin/invites', {
      count: Number(f.count), maxUses: Number(f.maxUses), note: f.note.trim() || undefined, expiresInDays: f.expiresInDays ? Number(f.expiresInDays) : undefined,
    }));
    if (codes) { setCreated(codes); void list.reload(); }
  }

  return (
    <Card>
      <h2 className="font-semibold text-navy-900">Codes d’invitation</h2>
      <p className="text-sm text-muted">À remettre à la main (partenaires, écoles). Un code à plusieurs places sert à tout un groupe.</p>
      <form onSubmit={create} className="mt-3 grid gap-3 sm:grid-cols-5 sm:items-end">
        <Field label="Nombre de codes"><Input type="number" min={1} max={100} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></Field>
        <Field label="Places par code"><Input type="number" min={1} max={1000} value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} /></Field>
        <Field label="Valable (jours)"><Input type="number" min={1} max={365} value={f.expiresInDays} onChange={(e) => setF({ ...f, expiresInDays: e.target.value })} placeholder="sans limite" /></Field>
        <Field label="Note"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="ex. Lycée de Douala" /></Field>
        <Button type="submit" busy={action.busy}>Créer</Button>
      </form>
      <div className="mt-3"><ErrorNotice error={action.error} /></div>
      {created.length > 0 && (
        <div className="mt-3"><Notice tone="ok" title={`${created.length} code(s) créé(s)`}><span className="select-all font-mono text-xs">{created.join('  ')}</span></Notice></div>
      )}
      {list.loading ? <Spinner /> : !list.data ? <ErrorNotice error={list.error} /> : list.data.length === 0 ? <p className="mt-3 text-sm text-muted">Aucun code pour l’instant.</p> : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted"><tr><th className="py-2">Code</th><th>Places</th><th>Pour</th><th>Expire le</th><th>État</th><th /></tr></thead>
            <tbody>{list.data.map((i) => {
              const [label, tone] = inviteState(i);
              return (
                <tr key={i.code} className="border-t border-line">
                  <td className="py-2 font-mono text-xs select-all">{i.code}</td>
                  <td>{i.uses} / {i.maxUses}</td>
                  <td>{i.email ?? i.note ?? '—'}</td>
                  <td>{i.expiresAt ? date(i.expiresAt) : '—'}</td>
                  <td><Badge tone={tone}>{label}</Badge></td>
                  <td className="text-right">{label === 'Active' && <Button size="sm" variant="ghost" onClick={() => void action.run(() => api.post(`/admin/invites/${i.code}/revoke`)).then(() => list.reload())}>Révoquer</Button>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Waitlist() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const leads = useLoad(() => api.get<Lead[]>(`/admin/leads${qs({ q: search })}`), [search]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ sent: number; skipped: number } | null>(null);
  const action = useAction();
  const invitable = (leads.data ?? []).filter((l) => !l.invitedAt && !l.registered);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  async function invite() {
    const r = await action.run(() => api.post<{ sent: number; skipped: number }>('/admin/leads/invite', { ids: [...selected] }));
    if (r) { setResult(r); setSelected(new Set()); void leads.reload(); }
  }

  async function remove(l: Lead) {
    if (!window.confirm(`Effacer définitivement ${l.email} de la liste d’attente ?`)) return;
    await action.run(() => api.del(`/admin/leads/${l.id}`));
    void leads.reload();
  }

  return (
    <Card>
      <h2 className="font-semibold text-navy-900">Liste d’attente</h2>
      <p className="text-sm text-muted">Adresses laissées sur la page d’accueil. « Inviter » envoie à chacune un code personnel valable 30 jours.</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}>
          <div className="min-w-56 flex-1"><Input placeholder="Rechercher une adresse" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Button type="submit" variant="secondary">Rechercher</Button>
        </form>
        <Button variant="secondary" onClick={() => setSelected(new Set(invitable.slice(0, 50).map((l) => l.id)))} disabled={!invitable.length}>Sélectionner les 50 premiers</Button>
        <Button onClick={() => void invite()} busy={action.busy} disabled={!selected.size}>Inviter ({selected.size})</Button>
      </div>
      <div className="mt-3"><ErrorNotice error={action.error} /></div>
      {result && <div className="mt-3"><Notice tone="ok">{result.sent} invitation(s) envoyée(s){result.skipped ? `, ${result.skipped} ignorée(s) (déjà invitée ou déjà inscrite)` : ''}.</Notice></div>}
      {leads.loading ? <Spinner /> : !leads.data ? <ErrorNotice error={leads.error} /> : leads.data.length === 0 ? <p className="mt-3 text-sm text-muted">Personne sur la liste d’attente.</p> : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted"><tr><th className="py-2" /><th>Adresse</th><th>Pays</th><th>Inscrit sur la liste</th><th>État</th><th /></tr></thead>
            <tbody>{leads.data.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="py-2"><input type="checkbox" aria-label={`Sélectionner ${l.email}`} disabled={!!l.invitedAt || l.registered} checked={selected.has(l.id)} onChange={() => toggle(l.id)} /></td>
                <td>{l.email}</td>
                <td>{l.country ?? '—'}</td>
                <td>{date(l.createdAt)}</td>
                <td>{l.registered ? <Badge tone="ok">Compte créé</Badge> : l.invitedAt ? <Badge tone="gold">Invité le {date(l.invitedAt, { day: 'numeric', month: 'short' })}</Badge> : <Badge tone="gray">En attente</Badge>}</td>
                <td className="text-right"><Button size="sm" variant="ghost" onClick={() => void remove(l)}>Effacer</Button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Beta() {
  const mode = useLoad(() => api.get<{ inviteOnly: boolean }>('/auth/signup'));
  return (
    <>
      <PageHeader title="Bêta privée & liste d’attente" subtitle="Inviter les premiers candidats et suivre les inscriptions de la page d’accueil." />
      {mode.data && (
        <div className="mb-4">
          <Notice tone={mode.data.inviteOnly ? 'info' : 'warn'}>
            {mode.data.inviteOnly
              ? 'Bêta privée active : un compte ne peut être créé qu’avec un code d’invitation.'
              : 'Inscriptions ouvertes à tous. Pour une bêta privée, mettez SIGNUP_MODE=invite dans la configuration du serveur. Les codes restent utiles pour suivre les groupes invités.'}
          </Notice>
        </div>
      )}
      <div className="space-y-6">
        <Waitlist />
        <Invites />
      </div>
    </>
  );
}

export default function BetaPage() {
  return <RequireAuth roles={['admin']}><Beta /></RequireAuth>;
}
