'use client';

import { useEffect, useState } from 'react';
import { Lock, ShieldCheck, Trash2 } from 'lucide-react';
import { Button, Card, ErrorNotice, Field, Input, Notice, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import { dateTime } from '@/lib/format';
import type { VaultData } from '@/lib/types';
import { VAULT_FIELDS } from '@/lib/vault-fields';

export default function VaultPage() {
  const { data, loading, error, reload } = useLoad(() => api.get<{ data: VaultData; updatedAt: string | null }>('/me/vault'));
  const [form, setForm] = useState<VaultData>({});
  const [saved, setSaved] = useState(false);
  const action = useAction();

  useEffect(() => {
    if (data) setForm(data.data);
  }, [data]);

  if (loading) return <Spinner />;
  if (error) return <ErrorNotice error={error} />;

  return (
    <>
      <PageHeader title="Coffre-fort candidat" subtitle="Vos informations d’inscription, prêtes à être recopiées en quelques secondes quand un centre ouvre." />
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const clean = Object.fromEntries(Object.entries(form).filter(([, v]) => v));
              const r = await action.run(() => api.put('/me/vault', clean));
              if (r) {
                setSaved(true);
                await reload();
              }
            }}
          >
            {VAULT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <Input type={f.type ?? 'text'} value={form[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => { setSaved(false); setForm({ ...form, [f.key]: e.target.value }); }} />
              </Field>
            ))}
            <div className="sm:col-span-2 space-y-3">
              <ErrorNotice error={action.error} />
              {saved && <Notice tone="ok">Coffre-fort chiffré et enregistré.</Notice>}
              <div className="flex flex-wrap justify-between gap-2">
                <Button type="submit" busy={action.busy}><Lock className="h-4 w-4" />Enregistrer de façon chiffrée</Button>
                {data?.updatedAt && (
                  <Button type="button" variant="danger" onClick={async () => { if (confirm('Effacer définitivement le coffre-fort ?')) { await action.run(() => api.del('/me/vault')); setForm({}); await reload(); } }}>
                    <Trash2 className="h-4 w-4" />Effacer
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Card>
        <div className="space-y-4">
          <Card className="bg-navy-900 text-white">
            <ShieldCheck className="h-6 w-6 text-gold-500" />
            <p className="mt-2 font-semibold">Chiffrement AES-256-GCM</p>
            <p className="mt-1 text-sm text-navy-100/75">Les données sont chiffrées avant d’être stockées, liées à votre compte, et chaque consultation est journalisée.</p>
            {data?.updatedAt && <p className="mt-3 text-xs text-navy-100/60">Mis à jour le {dateTime(data.updatedAt)}</p>}
          </Card>
          <Notice tone="info" title="Pourquoi pas de remplissage automatique ?">Les centres interdisent les robots d’inscription. C2Pass vous affiche vos données à côté du formulaire officiel : vous les copiez vous-même, en toute légalité.</Notice>
        </div>
      </div>
    </>
  );
}
