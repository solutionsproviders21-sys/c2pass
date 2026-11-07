'use client';

import { useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { Button, Card, ErrorNotice, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { dateTime } from '@/lib/format';
import type { AuditEntry } from '@/lib/types';

const ACTIONS: Record<string, string> = {
  'vault.': 'Coffre-fort', 'admin.': 'Administration', 'refund.,plan.': 'Offres et remboursements', 'gdpr.': 'RGPD',
  'account.,email.,password.,totp.,refresh_token.': 'Compte et sécurité',
};

function label(action: string) {
  return Object.entries(ACTIONS).find(([prefixes]) => prefixes.split(',').some((p) => action.startsWith(p)))?.[1] ?? '';
}

function Journal() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState({ q: '', action: '' });
  const log = useLoad(() => api.get<AuditEntry[]>(`/admin/audit${qs(search)}`), [search.q, search.action]);
  return (
    <>
      <PageHeader title="Journal d’audit" subtitle="Accès aux coffres-forts, actions des administrateurs, paiements, remboursements et demandes RGPD (300 derniers événements)." />
      <Card>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setSearch({ q: q.trim(), action }); }}>
          <div className="min-w-56 flex-1"><Input placeholder="E-mail du candidat ou de l’administrateur" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Tous les événements</option>
            {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Button type="submit" variant="secondary">Filtrer</Button>
        </form>
        {log.loading ? <Spinner /> : !log.data ? <ErrorNotice error={log.error} /> : log.data.length === 0 ? <p className="mt-3 text-sm text-muted">Aucun événement.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted"><tr><th className="py-2">Date</th><th>Événement</th><th>Compte concerné</th><th>Fait par</th><th>Adresse IP</th></tr></thead>
              <tbody>{log.data.map((a) => (
                <tr key={a.id} className="border-t border-line align-top">
                  <td className="py-2 whitespace-nowrap">{dateTime(a.createdAt)}</td>
                  <td><span className="font-mono text-xs">{a.action}</span>{label(a.action) && <span className="block text-xs text-muted">{label(a.action)}</span>}</td>
                  <td>{a.userEmail ?? '—'}</td>
                  <td>{a.actorEmail && a.actorEmail !== a.userEmail ? a.actorEmail : a.actorEmail ? 'le candidat' : 'système'}</td>
                  <td className="font-mono text-xs">{a.ip ?? '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

export default function JournalPage() {
  return <RequireAuth roles={['admin']}><Journal /></RequireAuth>;
}
