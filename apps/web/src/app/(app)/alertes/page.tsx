'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Bell, BellOff, Mail, MessageCircle, Pause, Play, Smartphone, Trash2 } from 'lucide-react';
import { ALERT_CHANNELS, type AlertChannel } from '@c2pass/shared';
import { Badge, Button, Card, CentreStatusBadge, cx, Empty, ErrorNotice, LinkButton, Notice, PageHeader, Select, Spinner } from '@/components/ui';
import { PushToggle } from '@/components/push-toggle';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useLoad } from '@/lib/hooks';
import { COUNTRY_NAMES, date, dateTime } from '@/lib/format';
import type { AlertSubscription, AppNotification, Centre } from '@/lib/types';

const CHANNEL_META: Record<AlertChannel, { label: string; icon: typeof Mail }> = {
  email: { label: 'E-mail', icon: Mail },
  sms: { label: 'SMS', icon: Smartphone },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  push: { label: 'Dans l’application', icon: Bell },
};

function Alerts() {
  const { me } = useAuth();
  const preselect = useSearchParams().get('centre');
  const subs = useLoad(() => api.get<AlertSubscription[]>('/alerts/subscriptions'));
  const notes = useLoad(() => api.get<AppNotification[]>('/notifications'));
  const centres = useLoad(() => api.get<Centre[]>('/centres'));
  const [centreId, setCentreId] = useState(preselect ?? '');
  const [channels, setChannels] = useState<AlertChannel[]>(['email', 'push']);
  const action = useAction();
  const plan = me?.plan;
  const limit = plan?.centreAlerts;

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    const ok = await action.run(() => api.post('/alerts/subscribe', { centreId, channels }));
    if (ok) {
      setCentreId('');
      await subs.reload();
    }
  }

  async function update(id: string, patch: object) {
    await action.run(() => api.patch(`/alerts/subscriptions/${id}`, patch));
    await subs.reload();
  }

  async function remove(id: string) {
    await action.run(() => api.del(`/alerts/subscriptions/${id}`));
    await subs.reload();
  }

  const unread = (notes.data ?? []).filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title="Alertes places"
        subtitle="Soyez prévenu dès qu’un centre ouvre ses inscriptions. Surveillance légale des pages publiques, sans robot de réservation."
        actions={plan && <Badge tone={plan.priorityAlerts ? 'gold' : 'navy'} className="text-sm">{plan.priorityAlerts ? 'Alertes prioritaires' : limit === 0 ? 'Non incluses' : `${subs.data?.length ?? 0} / ${limit} centres`}</Badge>}
      />
      {plan?.centreAlerts === 0 ? (
        <Card className="border-gold-500/40 bg-gold-50/50">
          <p className="flex items-center gap-2 font-semibold text-navy-900"><BellOff className="h-5 w-5 text-gold-500" />Les alertes sont incluses à partir de Premium Standard</p>
          <p className="mt-1 text-sm text-muted">Premium Standard surveille 3 centres ; Premium Pro et le Pack Réussite surveillent tous les centres, avec envoi prioritaire.</p>
          <LinkButton href="/tarifs" className="mt-4">Découvrir les offres</LinkButton>
        </Card>
      ) : (
        <Card>
          <form onSubmit={subscribe} className="grid gap-4 md:grid-cols-[1fr_auto]">
            <div className="space-y-3">
              <Select required value={centreId} onChange={(e) => setCentreId(e.target.value)} aria-label="Centre">
                <option value="">Choisir un centre d’examen…</option>
                {(centres.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.city}</option>)}
              </Select>
              <div className="flex flex-wrap gap-2">
                {ALERT_CHANNELS.map((ch) => {
                  const M = CHANNEL_META[ch];
                  const on = channels.includes(ch);
                  return (
                    <button type="button" key={ch} onClick={() => setChannels(on ? channels.filter((c) => c !== ch) : [...channels, ch])}
                      className={cx('flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium', on ? 'border-navy-900 bg-navy-900 text-white' : 'border-line bg-white text-navy-800')}>
                      <M.icon className="h-3.5 w-3.5" />{M.label}
                    </button>
                  );
                })}
              </div>
              {(channels.includes('sms') || channels.includes('whatsapp')) && !me?.phone && !me?.whatsapp && (
                <Notice tone="warn">Ajoutez votre numéro dans <Link href="/profil" className="underline">votre profil</Link> pour recevoir les SMS et messages WhatsApp.</Notice>
              )}
            </div>
            <Button type="submit" busy={action.busy} disabled={!centreId || channels.length === 0} className="self-start"><Bell className="h-4 w-4" />Activer l’alerte</Button>
          </form>
          <div className="mt-3"><ErrorNotice error={action.error} /></div>
        </Card>
      )}
      {plan?.centreAlerts !== 0 && <div className="mt-4"><PushToggle /></div>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <h2 className="mb-3 text-lg font-bold text-navy-900">Centres surveillés</h2>
          {subs.loading ? <Spinner /> : (subs.data ?? []).length === 0 ? (
            <Empty icon={<Bell className="h-8 w-8" />} title="Aucune alerte active">Choisissez un centre ci-dessus pour être prévenu de l’ouverture des inscriptions.</Empty>
          ) : (
            <div className="space-y-3">
              {subs.data!.map((s) => (
                <Card key={s.id} className={cx('p-4', s.status === 'paused' && 'opacity-60')}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-navy-900">{s.centreName}</p>
                      <p className="text-sm text-muted">{s.city}, {COUNTRY_NAMES[s.country] ?? s.country}{s.nextSessionDate ? ` · session du ${date(s.nextSessionDate)}` : ''}</p>
                    </div>
                    <CentreStatusBadge status={s.centreStatus} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {s.channels.map((ch) => <Badge key={ch} tone="gray">{CHANNEL_META[ch].label}</Badge>)}
                    {s.lastNotifiedAt && <span className="text-xs text-muted">Dernière alerte : {dateTime(s.lastNotifiedAt)}</span>}
                    <div className="ml-auto flex gap-1">
                      {s.centreStatus === 'open' && <LinkButton href={`/alertes/inscription/${s.centreId}`} size="sm">S’inscrire</LinkButton>}
                      <Button size="sm" variant="ghost" onClick={() => void update(s.id, { status: s.status === 'active' ? 'paused' : 'active' })} aria-label={s.status === 'active' ? 'Mettre en pause' : 'Réactiver'}>
                        {s.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void remove(s.id)} aria-label="Supprimer"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-navy-900">Notifications {unread > 0 && <Badge tone="maple">{unread}</Badge>}</h2>
            {unread > 0 && <button className="text-sm text-navy-700 underline" onClick={async () => { await api.post('/notifications/read'); await notes.reload(); }}>Tout marquer comme lu</button>}
          </div>
          {(notes.data ?? []).length === 0 ? <p className="text-sm text-muted">Aucune notification pour l’instant.</p> : (
            <div className="space-y-2">
              {notes.data!.map((n) => (
                <div key={n.id} className={cx('rounded-lg border p-3 text-sm', n.readAt ? 'border-line bg-white' : 'border-ok-600/30 bg-ok-50')}>
                  <p className="font-semibold text-navy-900">{n.title}</p>
                  <p className="mt-0.5 text-muted">{n.body}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-muted">{dateTime(n.createdAt)}</span>
                    {n.centreId && <Link href={`/alertes/inscription/${n.centreId}`} className="text-xs font-semibold text-maple-600">S’inscrire maintenant →</Link>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function AlertsPage() {
  return <Suspense><Alerts /></Suspense>;
}
