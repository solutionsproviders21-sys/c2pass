'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CreditCard, Download, KeyRound, ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { COUNTRIES, PLANS, type PlanId } from '@c2pass/shared';
import { PlanCards } from '@/components/plan-cards';
import { RefundDialog } from '@/components/refund-dialog';
import { TotpQr } from '@/components/totp-qr';
import { Badge, Button, Card, cx, ErrorNotice, Field, Input, Notice, PageHeader, Select, Spinner } from '@/components/ui';
import { api, setSession } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction, useLoad } from '@/lib/hooks';
import { date, dateTime, money } from '@/lib/format';
import type { Me, Payment, RefundRequest, Tokens } from '@/lib/types';

const METHODS = [
  { id: 'orange_money', label: 'Orange Money', color: '#ff7900' },
  { id: 'mtn_momo', label: 'MTN Mobile Money', color: '#ffcc00' },
  { id: 'stripe', label: 'Carte bancaire', color: '#635bff' },
] as const;
const PAYMENT_STATUS: Record<Payment['status'], [string, 'ok' | 'warn' | 'maple' | 'gray']> = {
  succeeded: ['Payé', 'ok'], pending: ['En attente', 'warn'], failed: ['Échoué', 'maple'], refunded: ['Remboursé', 'gray'],
};

function Profile() {
  const { me, reload, signOut } = useAuth();
  const router = useRouter();
  const offer = useSearchParams().get('offre') as PlanId | null;
  const payments = useLoad(() => api.get<Payment[]>('/payments'));
  const refunds = useLoad(() => api.get<RefundRequest[]>('/refunds'));
  const [refundFor, setRefundFor] = useState<Payment | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<PlanId | null>(offer && offer in PLANS && offer !== 'free' ? offer : null);

  if (!me) return <Spinner />;
  return (
    <>
      <PageHeader title="Profil & abonnement" subtitle={me.email} />
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <ProfileForm me={me} onSaved={reload} />
        <Card>
          <p className="font-semibold text-navy-900">Mon abonnement</p>
          <div className="mt-3 flex items-center gap-2">
            <Badge tone={me.plan.id === 'free' ? 'gray' : 'gold'} className="text-sm">{me.plan.name}</Badge>
            {me.planExpiresAt && me.plan.id !== 'free' && <span className="text-sm text-muted">jusqu’au {date(me.planExpiresAt)}</span>}
          </div>
          {me.planId !== 'free' && me.plan.id === 'free' && <p className="mt-2 text-sm text-warn-600">Votre offre {PLANS[me.planId]?.name} a expiré le {date(me.planExpiresAt)}.</p>}
          {me.c2GuaranteeUntil && <p className="mt-2 text-sm"><ShieldCheck className="mr-1 inline h-4 w-4 text-ok-600" />Garantie C2 active jusqu’au {date(me.c2GuaranteeUntil)}</p>}
          <ul className="mt-3 space-y-1 text-sm text-muted">{me.plan.highlights.map((h) => <li key={h}>• {h}</li>)}</ul>
          <p className="mt-5 text-sm font-semibold text-navy-900">Historique des paiements</p>
          {(payments.data ?? []).length === 0 ? <p className="mt-1 text-sm text-muted">Aucun paiement.</p> : (
            <ul className="mt-2 divide-y divide-line text-sm">
              {payments.data!.map((p) => (
                <li key={p.id} className="py-2">
                  <div className="flex items-center justify-between">
                    <span>{PLANS[p.planId]?.name} · {money(p.amount)}</span>
                    <span className="flex items-center gap-2 text-xs text-muted">{dateTime(p.createdAt)} <Badge tone={PAYMENT_STATUS[p.status][1]}>{PAYMENT_STATUS[p.status][0]}</Badge></span>
                  </div>
                  <RefundLine payment={p} request={refunds.data?.find((r) => r.paymentId === p.id)} onAsk={() => setRefundFor(p)} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <h2 className="mt-8 text-lg font-bold text-navy-900">Changer d’offre</h2>
      <div className="mt-3"><PlanCards current={me.plan.id} onChoose={setCheckoutPlan} /></div>
      {refundFor && <RefundDialog payment={refundFor} onClose={() => setRefundFor(null)} onSent={() => { setRefundFor(null); void refunds.reload(); }} />}
      {checkoutPlan && <Checkout planId={checkoutPlan} me={me} onClose={() => setCheckoutPlan(null)} onPaid={(id) => router.push(`/paiement/${id}`)} />}

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Security me={me} onChanged={reload} />
        <Privacy onDeleted={async () => { await signOut(); router.replace('/'); }} />
      </div>
    </>
  );
}

function ProfileForm({ me, onSaved }: { me: Me; onSaved: () => Promise<unknown> }) {
  const [f, setF] = useState({ firstName: '', lastName: '', country: '', city: '', phone: '', whatsapp: '', targetScore: 'C2', examDate: '' });
  const [ok, setOk] = useState(false);
  const action = useAction();
  useEffect(() => {
    setF({ firstName: me.firstName ?? '', lastName: me.lastName ?? '', country: me.country ?? '', city: me.city ?? '', phone: me.phone ?? '', whatsapp: me.whatsapp ?? '', targetScore: me.targetScore, examDate: me.examDate?.slice(0, 10) ?? '' });
  }, [me]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setOk(false); setF({ ...f, [k]: e.target.value }); };

  return (
    <Card>
      <p className="font-semibold text-navy-900">Informations personnelles</p>
      <form
        className="mt-4 grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await action.run(() => api.patch('/me', {
            firstName: f.firstName, lastName: f.lastName, country: f.country || null, city: f.city || null,
            phone: f.phone.trim() || null, whatsapp: f.whatsapp.trim() || null, targetScore: f.targetScore, examDate: f.examDate || null,
          }));
          if (r) {
            setOk(true);
            await onSaved();
          }
        }}
      >
        <Field label="Prénom"><Input value={f.firstName} onChange={set('firstName')} required /></Field>
        <Field label="Nom"><Input value={f.lastName} onChange={set('lastName')} required /></Field>
        <Field label="Pays"><Select value={f.country} onChange={set('country')}><option value="">—</option>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</Select></Field>
        <Field label="Ville"><Input value={f.city} onChange={set('city')} /></Field>
        <Field label="Téléphone (SMS)"><Input type="tel" value={f.phone} onChange={set('phone')} placeholder="+237 6…" /></Field>
        <Field label="WhatsApp" hint="Laissez vide pour utiliser le téléphone."><Input type="tel" value={f.whatsapp} onChange={set('whatsapp')} /></Field>
        <Field label="Niveau visé"><Select value={f.targetScore} onChange={set('targetScore')}><option>C2</option><option>C1</option><option>B2</option></Select></Field>
        <Field label="Date d’examen prévue"><Input type="date" value={f.examDate} onChange={set('examDate')} /></Field>
        <div className="space-y-2 sm:col-span-2">
          <ErrorNotice error={action.error} />
          {ok && <Notice tone="ok">Profil enregistré.</Notice>}
          <Button type="submit" busy={action.busy}>Enregistrer</Button>
        </div>
      </form>
    </Card>
  );
}

const REFUND_STATUS: Record<RefundRequest['status'], string> = { pending: 'Demande de remboursement en cours d’examen', approved: 'Remboursement accepté', rejected: 'Demande de remboursement refusée' };

function RefundLine({ payment, request, onAsk }: { payment: Payment; request?: RefundRequest; onAsk: () => void }) {
  const status = request && <p className="mt-1 text-xs text-muted">{REFUND_STATUS[request.status]}{request.adminNote ? ` : ${request.adminNote}` : ''}</p>;
  if (payment.status !== 'succeeded' || (request && request.status !== 'rejected')) return status ?? null;
  return <>{status}<button onClick={onAsk} className="mt-1 text-xs font-medium text-navy-700 underline">Demander un remboursement</button></>;
}

function Checkout({ planId, me, onClose, onPaid }: { planId: PlanId; me: Me; onClose: () => void; onPaid: (id: string) => void }) {
  const plan = PLANS[planId];
  const [method, setMethod] = useState<(typeof METHODS)[number]['id']>('orange_money');
  const [phone, setPhone] = useState(me.phone ?? '');
  const action = useAction();

  async function pay() {
    const p = await action.run(() => api.post<Payment>('/payments/checkout', { planId, method, phone: method === 'stripe' ? undefined : phone.trim() }));
    if (!p) return;
    if (p.checkoutUrl && p.status === 'pending') window.location.href = p.checkoutUrl;
    else onPaid(p.id);
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/60 px-4" onClick={onClose}>
      <Card className="w-full max-w-md" >
        <div onClick={(e) => e.stopPropagation()}>
          <p className="text-sm text-muted">Paiement</p>
          <p className="text-xl font-bold text-navy-900">{plan.name} · {money(plan.priceXaf)}</p>
          <p className="text-xs text-muted">{plan.billing === 'one_time' ? 'Paiement unique, accès 3 mois' : 'Accès 30 jours, sans renouvellement automatique'}</p>
          <div className="mt-4 space-y-2">
            {METHODS.map((m) => (
              <button key={m.id} onClick={() => setMethod(m.id)} className={cx('flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm font-medium', method === m.id ? 'border-navy-900 ring-1 ring-navy-900' : 'border-line')}>
                <span className="grid h-8 w-8 place-items-center rounded-md" style={{ background: m.color }}>{m.id === 'stripe' ? <CreditCard className="h-4 w-4 text-white" /> : <Smartphone className="h-4 w-4 text-navy-950" />}</span>
                {m.label}
              </button>
            ))}
          </div>
          {method !== 'stripe' && (
            <div className="mt-4"><Field label="Numéro Mobile Money" hint="Vous validerez le paiement sur votre téléphone."><Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+237 6 99 00 00 00" /></Field></div>
          )}
          <div className="mt-4"><ErrorNotice error={action.error} /></div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Annuler</Button>
            <Button onClick={() => void pay()} busy={action.busy} disabled={method !== 'stripe' && phone.trim().length < 8}>Payer {money(plan.priceXaf)}</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Security({ me, onChanged }: { me: Me; onChanged: () => Promise<unknown> }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [pwOk, setPwOk] = useState(false);
  const [enrol, setEnrol] = useState<{ challengeId: string; secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [totpPassword, setTotpPassword] = useState('');
  const pw = useAction();
  const totp = useAction();

  return (
    <Card>
      <p className="flex items-center gap-2 font-semibold text-navy-900"><KeyRound className="h-4 w-4" />Sécurité</p>
      <form className="mt-3 space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        const ok = await pw.run(async () => { await api.post('/auth/password', { current: me.hasPassword ? current : undefined, next }); return true; });
        if (ok) { setPwOk(true); setCurrent(''); setNext(''); }
      }}>
        {me.hasPassword && <Field label="Mot de passe actuel"><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" /></Field>}
        <Field label={me.hasPassword ? 'Nouveau mot de passe' : 'Définir un mot de passe'}><Input type="password" minLength={8} value={next} onChange={(e) => { setPwOk(false); setNext(e.target.value); }} required autoComplete="new-password" /></Field>
        <ErrorNotice error={pw.error} />
        {pwOk && <Notice tone="ok">Mot de passe mis à jour.</Notice>}
        <Button type="submit" variant="secondary" busy={pw.busy}>Mettre à jour</Button>
      </form>
      <div className="mt-6 border-t border-line pt-4">
        <p className="text-sm font-semibold text-navy-900">Double authentification (TOTP)</p>
        {me.totpEnabled ? <p className="mt-1 text-sm text-ok-600"><ShieldCheck className="mr-1 inline h-4 w-4" />Activée</p> : enrol ? (
          <form className="mt-3 space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const t = await totp.run(() => api.post<Tokens>('/auth/totp/verify', { challengeId: enrol.challengeId, code }));
            if (t) { setSession(t); setEnrol(null); await onChanged(); }
          }}>
            <TotpQr url={enrol.otpauthUrl} secret={enrol.secret} />
            <Field label="Code à 6 chiffres"><Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required /></Field>
            <ErrorNotice error={totp.error} />
            <Button type="submit" busy={totp.busy}>Activer</Button>
          </form>
        ) : (
          <form className="mt-2 space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const r = await totp.run(() => api.post<{ challengeId: string; secret: string; otpauthUrl: string }>('/auth/totp/setup', { password: me.hasPassword ? totpPassword : undefined }));
            if (r) { setEnrol(r); setTotpPassword(''); }
          }}>
            <p className="text-sm text-muted">Protégez votre compte avec une application d’authentification.</p>
            {me.hasPassword && <Field label="Confirmez votre mot de passe"><Input type="password" value={totpPassword} onChange={(e) => setTotpPassword(e.target.value)} required autoComplete="current-password" /></Field>}
            <ErrorNotice error={totp.error} />
            <Button type="submit" size="sm" variant="secondary" busy={totp.busy}>Activer la double authentification</Button>
          </form>
        )}
        {(me.google || me.facebook) && <p className="mt-3 text-xs text-muted">Comptes liés : {[me.google && 'Google', me.facebook && 'Facebook'].filter(Boolean).join(', ')}</p>}
      </div>
    </Card>
  );
}

function Privacy({ onDeleted }: { onDeleted: () => Promise<void> }) {
  const action = useAction();
  const [confirmText, setConfirmText] = useState('');
  return (
    <Card>
      <p className="font-semibold text-navy-900">Mes données (RGPD)</p>
      <p className="mt-1 text-sm text-muted">Téléchargez toutes les données que C2Pass détient sur vous, ou supprimez votre compte.</p>
      <Button className="mt-3" variant="secondary" busy={action.busy} onClick={async () => {
        const data = await action.run(() => api.get<object>('/me/export'));
        if (!data) return;
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `c2pass-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }}><Download className="h-4 w-4" />Exporter mes données</Button>
      <div className="mt-6 rounded-lg border border-maple-500/30 bg-maple-50/50 p-4">
        <p className="text-sm font-semibold text-maple-700">Supprimer mon compte</p>
        <p className="mt-1 text-xs text-muted">Effacement définitif du profil, des productions, du coffre-fort et des alertes. Les paiements sont conservés de façon anonyme pour la comptabilité.</p>
        <Field label="Tapez SUPPRIMER pour confirmer"><Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} /></Field>
        <Button className="mt-3" variant="danger" disabled={confirmText !== 'SUPPRIMER'} busy={action.busy} onClick={async () => {
          const ok = await action.run(async () => { await api.del('/me'); return true; });
          if (ok) await onDeleted();
        }}><Trash2 className="h-4 w-4" />Supprimer définitivement</Button>
      </div>
      <ErrorNotice error={action.error} />
    </Card>
  );
}

export default function ProfilePage() {
  return <Suspense><Profile /></Suspense>;
}
