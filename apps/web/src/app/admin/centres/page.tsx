'use client';

import { useState } from 'react';
import { History, Pencil, Plus, Radar, Trash2 } from 'lucide-react';
import { CENTRE_STATUS_LABELS, CENTRE_STATUSES, COUNTRIES, type CentreStatus } from '@c2pass/shared';
import { Button, Card, CentreStatusBadge, cx, ErrorNotice, Field, Input, Notice, PageHeader, Select, Spinner } from '@/components/ui';
import { RequireAuth } from '@/components/require-auth';
import { api } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import { date, dateTime, money } from '@/lib/format';
import type { Centre } from '@/lib/types';

const CHECK_RESULTS: Record<string, string> = {
  open: 'Inscriptions détectées comme ouvertes', full: 'Détecté complet', closed: 'Fermé', unknown: 'Aucun motif reconnu',
  robots_disallowed: 'Interdit par robots.txt : surveillance arrêtée', no_watch_url: 'Pas d’URL de surveillance',
};

function CentresAdmin() {
  const { data, error, loading, reload } = useLoad(() => api.get<Centre[]>('/centres/admin'));
  const [editing, setEditing] = useState<Partial<Centre> | null>(null);
  const [history, setHistory] = useState<{ id: string; rows: { previous: string | null; status: string; source: string; changedAt: string }[] } | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const action = useAction();

  async function setStatus(c: Centre, status: CentreStatus) {
    const r = await action.run(() => api.patch(`/centres/${c.id}/status`, { status }));
    if (r) {
      setInfo(status === 'open' ? `${c.name} est ouvert : les abonnés sont alertés (prioritaires d’abord).` : `${c.name} : ${CENTRE_STATUS_LABELS[status]}.`);
      await reload();
    }
  }

  async function check(c: Centre) {
    const r = await action.run(() => api.post<{ result: string }>(`/centres/${c.id}/check`));
    if (r) {
      setInfo(`${c.name} : ${CHECK_RESULTS[r.result] ?? r.result}`);
      await reload();
    }
  }

  return (
    <>
      <PageHeader title="Centres & statuts" subtitle="Mise à jour manuelle Ouvert / Fermé / Complet. Passer un centre à « Ouvert » déclenche les alertes." actions={<Button onClick={() => setEditing({ country: 'CM', status: 'closed' })}><Plus className="h-4 w-4" />Ajouter un centre</Button>} />
      {info && <div className="mb-4"><Notice tone="ok">{info}</Notice></div>}
      <ErrorNotice error={action.error ?? error} />
      {loading ? <Spinner /> : (
        <div className="mt-3 space-y-3">
          {(data ?? []).map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-navy-900">{c.name}</p>
                  <p className="text-sm text-muted">{c.city} · {COUNTRIES.find((x) => x.code === c.country)?.name} · {c.nextSessionDate ? `session du ${date(c.nextSessionDate)}` : 'pas de date'}{c.seatsLeft !== null ? ` · ${c.seatsLeft} places` : ''}{c.priceXaf ? ` · ${money(c.priceXaf)}` : ''}</p>
                  <p className="mt-1 text-xs text-muted">
                    {c.watchUrl ? <>Surveillance : <span className="font-mono">{new URL(c.watchUrl).host}</span>{c.lastCheckedAt && ` · vérifié ${dateTime(c.lastCheckedAt)} (${CHECK_RESULTS[c.lastCheckResult ?? ''] ?? c.lastCheckResult ?? '—'})`}</> : 'Pas de surveillance automatique'}
                  </p>
                </div>
                <CentreStatusBadge status={c.status} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {CENTRE_STATUSES.map((s) => (
                  <button key={s} onClick={() => void setStatus(c, s)} disabled={c.status === s || action.busy}
                    className={cx('rounded-md border px-3 py-1 text-xs font-semibold', c.status === s ? 'border-navy-900 bg-navy-900 text-white' : 'border-line hover:border-navy-700')}>
                    {CENTRE_STATUS_LABELS[s]}
                  </button>
                ))}
                <span className="mx-1 h-5 w-px bg-line" />
                <Button size="sm" variant="ghost" onClick={() => void check(c)} disabled={!c.watchUrl}><Radar className="h-4 w-4" />Vérifier maintenant</Button>
                <Button size="sm" variant="ghost" onClick={async () => setHistory({ id: c.id, rows: await api.get(`/centres/${c.id}/history`) })}><History className="h-4 w-4" />Historique</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" />Modifier</Button>
                <Button size="sm" variant="ghost" onClick={async () => { if (confirm(`Supprimer ${c.name} ?`)) { await action.run(async () => { await api.del(`/centres/${c.id}`); return true; }); await reload(); } }}><Trash2 className="h-4 w-4" /></Button>
              </div>
              {history?.id === c.id && (
                <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-muted">
                  {history.rows.length === 0 && <li>Aucun changement enregistré.</li>}
                  {history.rows.map((h, i) => <li key={i}>{dateTime(h.changedAt)} · {h.previous ? CENTRE_STATUS_LABELS[h.previous as CentreStatus] : '—'} → <b>{CENTRE_STATUS_LABELS[h.status as CentreStatus]}</b> ({h.source === 'watcher' ? 'surveillance' : 'admin'})</li>)}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
      {editing && <CentreForm initial={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
    </>
  );
}

function CentreForm({ initial, onClose, onSaved }: { initial: Partial<Centre>; onClose: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState<Partial<Centre>>(initial);
  const action = useAction();
  const text = (k: keyof Centre) => ({ value: (f[k] as string | null | undefined) ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }) });
  const num = (k: keyof Centre) => ({ value: f[k] === null || f[k] === undefined ? '' : String(f[k]), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value === '' ? null : Number(e.target.value) }) });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const nul = (v: unknown) => (v === '' || v === undefined ? null : v);
    const body = {
      name: f.name, country: f.country, city: f.city, address: nul(f.address), lat: nul(f.lat), lng: nul(f.lng), phone: nul(f.phone), email: nul(f.email),
      website: nul(f.website), bookingUrl: nul(f.bookingUrl), priceXaf: nul(f.priceXaf), nextSessionDate: nul(f.nextSessionDate?.slice(0, 10)), seatsLeft: nul(f.seatsLeft),
      watchUrl: nul(f.watchUrl), watchOpenPattern: nul(f.watchOpenPattern), watchFullPattern: nul(f.watchFullPattern), ...(initial.id ? {} : { status: f.status }),
    };
    const r = await action.run(() => (initial.id ? api.put(`/centres/${initial.id}`, body) : api.post('/centres', body)));
    if (r) await onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/60 px-4 py-10">
      <Card className="mx-auto max-w-2xl">
        <p className="text-lg font-bold text-navy-900">{initial.id ? `Modifier ${initial.name}` : 'Nouveau centre'}</p>
        <form onSubmit={save} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Nom"><Input required {...text('name')} /></Field>
          <Field label="Pays"><Select value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</Select></Field>
          <Field label="Ville"><Input required {...text('city')} /></Field>
          <Field label="Adresse"><Input {...text('address')} /></Field>
          <Field label="Latitude"><Input type="number" step="any" {...num('lat')} /></Field>
          <Field label="Longitude"><Input type="number" step="any" {...num('lng')} /></Field>
          <Field label="Téléphone"><Input {...text('phone')} /></Field>
          <Field label="E-mail"><Input type="email" {...text('email')} /></Field>
          <Field label="Site web"><Input type="url" {...text('website')} /></Field>
          <Field label="Page d’inscription"><Input type="url" {...text('bookingUrl')} /></Field>
          <Field label="Frais (FCFA)"><Input type="number" {...num('priceXaf')} /></Field>
          <Field label="Places restantes"><Input type="number" {...num('seatsLeft')} /></Field>
          <Field label="Prochaine session"><Input type="date" value={f.nextSessionDate?.slice(0, 10) ?? ''} onChange={(e) => setF({ ...f, nextSessionDate: e.target.value || null })} /></Field>
          {!initial.id && <Field label="Statut"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as CentreStatus })}>{CENTRE_STATUSES.map((s) => <option key={s} value={s}>{CENTRE_STATUS_LABELS[s]}</option>)}</Select></Field>}
          <div className="sm:col-span-2 mt-2 rounded-lg bg-navy-50 p-3">
            <p className="text-sm font-semibold text-navy-900">Surveillance automatique (légale)</p>
            <p className="text-xs text-muted">Page publique consultée toutes les 5 à 10 min, uniquement si robots.txt l’autorise. Les motifs sont des expressions régulières (insensibles à la casse).</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="URL surveillée"><Input type="url" {...text('watchUrl')} /></Field>
              <Field label="Motif « ouvert »"><Input placeholder="inscriptions? (sont )?ouvertes" {...text('watchOpenPattern')} /></Field>
              <Field label="Motif « complet »"><Input placeholder="complet|plus de places" {...text('watchFullPattern')} /></Field>
            </div>
          </div>
          <div className="sm:col-span-2"><ErrorNotice error={action.error} /></div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
            <Button type="submit" busy={action.busy}>Enregistrer</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function CentresAdminPage() {
  return <RequireAuth roles={['admin']}><CentresAdmin /></RequireAuth>;
}
