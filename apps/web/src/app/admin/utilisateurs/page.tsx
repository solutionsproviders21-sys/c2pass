'use client';

import { useState } from 'react';
import { PLAN_IDS, PLANS, type PlanId } from '@c2pass/shared';
import { Badge, ErrorNotice, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { RequireAuth } from '@/components/require-auth';
import { api, qs } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import { date } from '@/lib/format';
import type { Role } from '@/lib/types';

interface Row { id: string; email: string; role: Role; status: 'active' | 'suspended'; planId: PlanId; planExpiresAt: string | null; createdAt: string; lastSeenAt: string | null; firstName: string | null; lastName: string | null; country: string | null }

function UsersView() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const { data, error, loading, reload } = useLoad(() => api.get<Row[]>(`/admin/users${qs({ q: search })}`), [search]);
  const action = useAction();

  async function patch(id: string, body: object) {
    await action.run(() => api.patch(`/admin/users/${id}`, body));
    await reload();
  }

  return (
    <>
      <PageHeader title="Utilisateurs" subtitle="Rôles, suspension et attribution manuelle d’offres (support, partenariats)." />
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(q); }}>
        <Input placeholder="Rechercher par e-mail ou nom…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      </form>
      <ErrorNotice error={action.error ?? error} />
      {loading ? <Spinner /> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-navy-50 text-left text-xs uppercase text-muted">
              <tr><th className="px-3 py-2">Utilisateur</th><th className="px-3 py-2">Rôle</th><th className="px-3 py-2">Offre</th><th className="px-3 py-2">Statut</th><th className="px-3 py-2">Dernière visite</th></tr>
            </thead>
            <tbody>
              {(data ?? []).map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="px-3 py-2"><p className="font-medium">{[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}</p><p className="text-xs text-muted">{u.email}</p></td>
                  <td className="px-3 py-2">
                    <Select value={u.role} onChange={(e) => void patch(u.id, { role: e.target.value })} className="h-8 w-32">
                      <option value="student">Étudiant</option><option value="teacher">Correcteur</option><option value="admin">Admin</option>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Select value={u.planId} onChange={(e) => void patch(u.id, { planId: e.target.value, planDays: e.target.value === 'reussite' ? 90 : 30 })} className="h-8 w-44">
                      {PLAN_IDS.map((p) => <option key={p} value={p}>{PLANS[p].name}</option>)}
                    </Select>
                    {u.planExpiresAt && <p className="mt-0.5 text-xs text-muted">jusqu’au {date(u.planExpiresAt)}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => void patch(u.id, { status: u.status === 'active' ? 'suspended' : 'active' })}>
                      <Badge tone={u.status === 'active' ? 'ok' : 'maple'}>{u.status === 'active' ? 'Actif' : 'Suspendu'}</Badge>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-muted">{u.lastSeenAt ? date(u.lastSeenAt) : 'Jamais'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function UsersPage() {
  return <RequireAuth roles={['admin']}><UsersView /></RequireAuth>;
}
