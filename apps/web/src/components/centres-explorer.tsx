'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Bell, CalendarDays, ExternalLink, Globe, Mail, MapPin, Phone, Users } from 'lucide-react';
import { CENTRE_STATUS_LABELS, CENTRE_STATUSES, COUNTRIES } from '@c2pass/shared';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { date, money } from '@/lib/format';
import type { Centre } from '@/lib/types';
import { Card, CentreStatusBadge, cx, ErrorNotice, LinkButton, Select, Spinner } from './ui';

const CentresMap = dynamic(() => import('./centres-map'), { ssr: false, loading: () => <div className="h-[420px] animate-pulse rounded-xl bg-navy-50" /> });

export function CentresExplorer({ signedIn }: { signedIn: boolean }) {
  const { data, error, loading } = useLoad(() => api.get<Centre[]>('/centres'));
  const [country, setCountry] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const centres = useMemo(
    () => (data ?? []).filter((c) => (!country || c.country === country) && (!status || c.status === status)),
    [data, country, status],
  );
  const open = (data ?? []).filter((c) => c.status === 'open').length;

  if (loading) return <Spinner />;
  if (error) return <ErrorNotice error={error} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={country} onChange={(e) => setCountry(e.target.value)} className="w-auto" aria-label="Pays">
          <option value="">Tous les pays</option>
          {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Statut">
          <option value="">Tous les statuts</option>
          {CENTRE_STATUSES.map((s) => <option key={s} value={s}>{CENTRE_STATUS_LABELS[s]}</option>)}
        </Select>
        <p className="text-sm text-muted"><b className="text-ok-600">{open}</b> centre(s) ouvert(s) aux inscriptions</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="order-2 max-h-[560px] space-y-3 overflow-y-auto pr-1 lg:order-1">
          {centres.length === 0 && <p className="text-sm text-muted">Aucun centre pour ces filtres.</p>}
          {centres.map((c) => (
            <Card key={c.id} className={cx('cursor-pointer p-4 transition hover:border-navy-700', selected === c.id && 'border-navy-700 ring-1 ring-navy-700')}>
              <div onClick={() => setSelected(c.id)}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-navy-900">{c.name}</p>
                    <p className="flex items-center gap-1 text-sm text-muted"><MapPin className="h-3.5 w-3.5" />{c.city}, {COUNTRIES.find((x) => x.code === c.country)?.name}</p>
                  </div>
                  <CentreStatusBadge status={c.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <p className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-slate-400" />{c.nextSessionDate ? date(c.nextSessionDate) : 'Date à venir'}</p>
                  <p className="flex items-center gap-1.5"><Users className="h-4 w-4 text-slate-400" />{c.seatsLeft !== null ? `${c.seatsLeft} place(s)` : '—'}</p>
                  {c.priceXaf !== null && <p className="col-span-2 text-muted">Frais d’inscription : <b className="text-ink">{money(c.priceXaf)}</b></p>}
                </div>
                {selected === c.id && (
                  <div className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                    {c.address && <p className="text-muted">{c.address}</p>}
                    {c.phone && <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-slate-400" />{c.phone}</p>}
                    {c.email && <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-400" />{c.email}</p>}
                    {c.website && <a href={c.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-navy-700 underline"><Globe className="h-3.5 w-3.5" />Site officiel</a>}
                    <p className="pt-1 text-xs text-muted">Statut vérifié {c.lastCheckedAt ? `le ${date(c.lastCheckedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : `le ${date(c.updatedAt)}`}</p>
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {c.status === 'open' && c.bookingUrl && (
                  signedIn
                    ? <LinkButton href={`/alertes/inscription/${c.id}`} size="sm">S’inscrire avec mon coffre-fort</LinkButton>
                    : <a href={c.bookingUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg bg-maple-600 px-3 text-sm font-semibold text-white">Page d’inscription <ExternalLink className="h-3.5 w-3.5" /></a>
                )}
                <LinkButton href={signedIn ? `/alertes?centre=${c.id}` : '/inscription'} size="sm" variant="secondary"><Bell className="h-3.5 w-3.5" />M’alerter</LinkButton>
              </div>
            </Card>
          ))}
        </div>
        <div className="order-1 lg:order-2">
          <div className="sticky top-20">
            <CentresMap centres={centres} selected={selected} onSelect={setSelected} height={520} />
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
              {CENTRE_STATUSES.map((s) => <span key={s} className="flex items-center gap-1"><CentreStatusBadge status={s} /></span>)}
              {!signedIn && <Link href="/inscription" className="ml-auto text-navy-700 underline">Créer un compte pour être alerté</Link>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
