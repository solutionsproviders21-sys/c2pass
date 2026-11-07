'use client';

import { useState } from 'react';
import { PLANS } from '@c2pass/shared';
import { api } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import { money } from '@/lib/format';
import type { Payment, RefundEligibility, RefundKind } from '@/lib/types';
import { Button, Card, cx, ErrorNotice, Field, Input, Notice, Spinner, Textarea } from './ui';

const KINDS: Record<RefundKind, { title: string; text: string }> = {
  withdrawal: { title: 'Rétractation', text: 'Offre non utilisée, dans les 7 jours qui suivent le paiement.' },
  c2_guarantee: { title: 'Garantie C2', text: 'Pack Réussite suivi 3 mois, au moins 3 simulations complètes, C2 non obtenu à l’examen officiel.' },
};

/** Candidate side of the CGU §7 and §8: asks for a refund of one payment. */
export function RefundDialog({ payment, onClose, onSent }: { payment: Payment; onClose: () => void; onSent: () => void }) {
  const eligibility = useLoad(() => api.get<RefundEligibility>(`/payments/${payment.id}/refund`), [payment.id]);
  const [kind, setKind] = useState<RefundKind | null>(null);
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const action = useAction();
  const chosen = kind ?? (eligibility.data ? (Object.keys(KINDS) as RefundKind[]).find((k) => eligibility.data![k].eligible) ?? null : null);

  async function send() {
    if (!chosen) return;
    const form = new FormData();
    form.set('kind', chosen);
    if (reason.trim()) form.set('reason', reason.trim());
    if (file) form.set('attestation', file);
    if (await action.run(() => api.post(`/payments/${payment.id}/refund`, form))) onSent();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/60 px-4" onClick={onClose}>
      <Card className="w-full max-w-md">
        <div onClick={(e) => e.stopPropagation()}>
          <p className="text-sm text-muted">Demande de remboursement</p>
          <p className="text-xl font-bold text-navy-900">{PLANS[payment.planId]?.name} · {money(payment.amount)}</p>
          {eligibility.loading ? <Spinner /> : !eligibility.data ? <ErrorNotice error={eligibility.error} /> : (
            <>
              <div className="mt-4 space-y-2">
                {(Object.keys(KINDS) as RefundKind[]).map((k) => {
                  const e = eligibility.data![k];
                  return (
                    <button key={k} disabled={!e.eligible} onClick={() => setKind(k)}
                      className={cx('w-full rounded-lg border p-3 text-left text-sm', chosen === k ? 'border-navy-900 ring-1 ring-navy-900' : 'border-line', !e.eligible && 'cursor-not-allowed opacity-60')}>
                      <span className="font-semibold text-navy-900">{KINDS[k].title}</span>
                      <span className="mt-0.5 block text-muted">{e.eligible ? KINDS[k].text : e.reason}</span>
                    </button>
                  );
                })}
              </div>
              {chosen ? (
                <div className="mt-4 space-y-3">
                  {chosen === 'c2_guarantee' && (
                    <Field label="Attestation officielle de résultats du TCF Canada" hint="PDF ou photo, 10 Mo maximum.">
                      <Input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                    </Field>
                  )}
                  <Field label="Message (facultatif)"><Textarea rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
                  <p className="text-xs text-muted">Une fois la demande acceptée, l’offre payée par ce paiement prend fin et le montant vous est renvoyé sur le moyen de paiement utilisé.</p>
                </div>
              ) : <div className="mt-4"><Notice tone="warn">Ce paiement ne peut pas être remboursé pour le moment.</Notice></div>}
            </>
          )}
          <div className="mt-4"><ErrorNotice error={action.error} /></div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Fermer</Button>
            {chosen && <Button onClick={() => void send()} busy={action.busy} disabled={chosen === 'c2_guarantee' && !file}>Envoyer la demande</Button>}
          </div>
        </div>
      </Card>
    </div>
  );
}
