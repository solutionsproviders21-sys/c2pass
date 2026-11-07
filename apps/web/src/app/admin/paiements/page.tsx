'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { PLANS } from '@c2pass/shared';
import { RequireAuth } from '@/components/require-auth';
import { Badge, Button, Card, ErrorNotice, Input, Notice, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { api, fetchRaw, qs } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import { dateTime, money } from '@/lib/format';
import type { AdminPayment, AdminRefund } from '@/lib/types';

const METHOD: Record<AdminPayment['method'], string> = { orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', stripe: 'Carte' };
const STATUS: Record<AdminPayment['status'], [string, 'ok' | 'warn' | 'maple' | 'gray']> = {
  succeeded: ['Payé', 'ok'], pending: ['En attente', 'warn'], failed: ['Échoué', 'maple'], refunded: ['Remboursé', 'gray'],
};
const KIND: Record<AdminRefund['kind'], string> = { withdrawal: 'Rétractation (7 jours)', c2_guarantee: 'Garantie C2', admin: 'Remboursement direct' };

function Payments() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState({ q: '', status: '' });
  const refunds = useLoad(() => api.get<AdminRefund[]>('/admin/refunds'));
  const payments = useLoad(() => api.get<AdminPayment[]>(`/admin/payments${qs(search)}`), [search.q, search.status]);
  const reloadAll = () => Promise.all([refunds.reload(), payments.reload()]);
  const pending = (refunds.data ?? []).filter((r) => r.status === 'pending');

  return (
    <>
      <PageHeader title="Paiements & remboursements" subtitle="Les montants se renvoient depuis vos comptes marchands Orange Money, MTN ou Stripe ; ici, vous validez la décision et l’offre du candidat prend fin." />
      <Card>
        <p className="font-semibold text-navy-900">Demandes de remboursement à traiter {pending.length > 0 && <Badge tone="warn">{pending.length}</Badge>}</p>
        {refunds.loading ? <Spinner /> : pending.length === 0 ? <p className="mt-2 text-sm text-muted">Aucune demande en attente.</p> : (
          <div className="mt-3 space-y-3">{pending.map((r) => <RefundCard key={r.id} refund={r} onDone={reloadAll} />)}</div>
        )}
      </Card>

      <Card className="mt-4">
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); setSearch({ q: q.trim(), status }); }}>
          <div className="min-w-56 flex-1"><Input placeholder="E-mail, référence ou identifiant du paiement" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous les statuts</option>
            {Object.entries(STATUS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
          </Select>
          <Button type="submit" variant="secondary">Rechercher</Button>
        </form>
        {payments.loading ? <Spinner /> : !payments.data ? <ErrorNotice error={payments.error} /> : payments.data.length === 0 ? <p className="mt-3 text-sm text-muted">Aucun paiement.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted"><tr><th className="py-2">Date</th><th>Candidat</th><th>Offre</th><th>Montant</th><th>Moyen</th><th>Statut</th><th /></tr></thead>
              <tbody>{payments.data.map((p) => <PaymentRow key={p.id} payment={p} onDone={reloadAll} />)}</tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-4">
        <p className="font-semibold text-navy-900">Demandes déjà traitées</p>
        <ul className="mt-2 divide-y divide-line text-sm">
          {(refunds.data ?? []).filter((r) => r.status !== 'pending').slice(0, 50).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{r.email} · {KIND[r.kind]} · {money(r.amount)}</span>
              <span className="flex items-center gap-2 text-xs text-muted">{dateTime(r.decidedAt)} <Badge tone={r.status === 'approved' ? 'ok' : 'maple'}>{r.status === 'approved' ? 'Remboursé' : 'Refusé'}</Badge></span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function RefundCard({ refund: r, onDone }: { refund: AdminRefund; onDone: () => Promise<unknown> }) {
  const [note, setNote] = useState('');
  const action = useAction();
  async function decide(approve: boolean) {
    if (await action.run(() => api.post(`/admin/refunds/${r.id}/decision`, { approve, note: note.trim() || undefined }))) await onDone();
  }
  async function download() {
    const res = await fetchRaw(`/admin/refunds/${r.id}/attestation`);
    const url = URL.createObjectURL(await res.blob());
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-navy-900">{r.email}</p>
        <Badge tone="warn">{KIND[r.kind]}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">{PLANS[r.planId]?.name} · {money(r.amount)} · {METHOD[r.method]} · payé le {dateTime(r.paidAt)} · demandé le {dateTime(r.createdAt)}</p>
      {r.reason && <p className="mt-2 text-sm">« {r.reason} »</p>}
      {r.hasAttestation && <Button variant="secondary" size="sm" className="mt-2" onClick={() => void download()}><Download className="h-4 w-4" /> Voir l’attestation</Button>}
      {r.kind === 'c2_guarantee' && <div className="mt-2"><Notice tone="info">Vérifiez sur l’attestation que le niveau C2 n’est pas atteint dans une compétence visée.</Notice></div>}
      <div className="mt-3"><Textarea rows={2} placeholder="Message au candidat (obligatoire en cas de refus)" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <div className="mt-2"><ErrorNotice error={action.error} /></div>
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="secondary" busy={action.busy} disabled={!note.trim()} onClick={() => void decide(false)}>Refuser</Button>
        <Button busy={action.busy} onClick={() => { if (confirm(`Confirmer le remboursement de ${money(r.amount)} à ${r.email} ? L’offre prendra fin.`)) void decide(true); }}>Rembourser</Button>
      </div>
    </div>
  );
}

function PaymentRow({ payment: p, onDone }: { payment: AdminPayment; onDone: () => Promise<unknown> }) {
  const action = useAction();
  async function refund() {
    const note = prompt(`Rembourser ${money(p.amount)} à ${p.email} ? L’offre prendra fin.\nMessage au candidat (facultatif) :`);
    if (note === null) return;
    if (await action.run(() => api.post(`/admin/payments/${p.id}/refund`, { note: note.trim() || undefined }))) await onDone();
  }
  return (
    <tr className="border-t border-line align-top">
      <td className="py-2 whitespace-nowrap">{dateTime(p.createdAt)}</td>
      <td>{p.email}</td>
      <td>{PLANS[p.planId]?.name}</td>
      <td className="whitespace-nowrap">{money(p.amount)}</td>
      <td>{METHOD[p.method]}{p.providerRef && <span className="block font-mono text-xs text-muted">{p.providerRef.slice(0, 18)}</span>}</td>
      <td><Badge tone={STATUS[p.status][1]}>{STATUS[p.status][0]}</Badge></td>
      <td className="text-right">
        {p.status === 'succeeded' && <Button variant="secondary" size="sm" busy={action.busy} onClick={() => void refund()}>Rembourser</Button>}
        {action.error ? <span className="block text-xs text-maple-600">{action.error.message}</span> : null}
      </td>
    </tr>
  );
}

export default function PaymentsPage() {
  return <RequireAuth roles={['admin']}><Payments /></RequireAuth>;
}
