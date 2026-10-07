'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Check, Copy, ExternalLink, Info } from 'lucide-react';
import { Card, CentreStatusBadge, Empty, ErrorNotice, LinkButton, Notice, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { date, money } from '@/lib/format';
import type { Centre, VaultData } from '@/lib/types';
import { VAULT_FIELDS } from '@/lib/vault-fields';

/**
 * Assistant de pré-remplissage (module 4): the official booking page opens in a new tab and the
 * candidate copies each value from the vault. Nothing is submitted on their behalf.
 */
export default function RegistrationAssistant() {
  const { centreId } = useParams<{ centreId: string }>();
  const centre = useLoad(() => api.get<Centre>(`/centres/${centreId}`), [centreId]);
  const vault = useLoad(() => api.get<{ data: VaultData }>('/me/vault'));
  const [copied, setCopied] = useState<string | null>(null);

  if (centre.loading || vault.loading) return <Spinner />;
  if (centre.error || !centre.data) return <ErrorNotice error={centre.error} />;
  const c = centre.data;
  const fields = VAULT_FIELDS.filter((f) => vault.data?.data[f.key]);

  async function copy(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
  }

  return (
    <>
      <PageHeader title={`S’inscrire : ${c.name}`} subtitle={`${c.city}${c.nextSessionDate ? ` · session du ${date(c.nextSessionDate)}` : ''}${c.priceXaf ? ` · ${money(c.priceXaf)}` : ''}`} actions={<CentreStatusBadge status={c.status} />} />
      {c.status !== 'open' && <div className="mb-4"><Notice tone="warn">Ce centre n’est pas signalé comme ouvert pour le moment. Vous pouvez tout de même vérifier sa page.</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <p className="font-semibold text-navy-900">1. Ouvrez le formulaire officiel</p>
          <p className="mt-1 text-sm text-muted">Il s’ouvre dans un nouvel onglet. Gardez cette page à côté (écran partagé sur ordinateur).</p>
          {c.bookingUrl || c.website ? (
            <a href={c.bookingUrl ?? c.website!} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-12 items-center gap-2 rounded-lg bg-maple-600 px-6 font-semibold text-white hover:bg-maple-700">
              Page d’inscription officielle <ExternalLink className="h-4 w-4" />
            </a>
          ) : (
            <div className="mt-4"><Notice tone="warn">Le lien d’inscription de ce centre n’a pas encore été renseigné par l’équipe C2Pass.{c.phone || c.email ? ` Contact : ${[c.phone, c.email].filter(Boolean).join(' · ')}.` : ''}</Notice></div>
          )}
          <div className="mt-6 flex gap-2 rounded-lg bg-navy-50 p-3 text-sm text-navy-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            Conformément aux règles des centres, C2Pass ne remplit ni n’envoie le formulaire à votre place, et ne contourne aucune file d’attente ni captcha.
          </div>
        </Card>
        <Card>
          <p className="font-semibold text-navy-900">2. Copiez vos informations</p>
          {fields.length === 0 ? (
            <div className="mt-3"><Empty title="Coffre-fort vide">Enregistrez vos informations une fois pour toutes, elles seront prêtes à la prochaine ouverture.<div className="mt-3"><LinkButton href="/coffre-fort" size="sm">Remplir mon coffre-fort</LinkButton></div></Empty></div>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {fields.map((f) => {
                const v = vault.data!.data[f.key]!;
                return (
                  <li key={f.key} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs text-muted">{f.label}</p>
                      <p className="truncate font-medium">{v}</p>
                    </div>
                    <button onClick={() => void copy(f.key, v)} className="flex shrink-0 items-center gap-1 rounded-md border border-line px-2.5 py-1 text-xs font-semibold hover:bg-navy-50">
                      {copied === f.key ? <><Check className="h-3.5 w-3.5 text-ok-600" />Copié</> : <><Copy className="h-3.5 w-3.5" />Copier</>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
