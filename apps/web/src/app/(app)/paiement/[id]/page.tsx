'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { PLANS } from '@c2pass/shared';
import { Card, ErrorNotice, LinkButton, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/hooks';
import { money } from '@/lib/format';
import type { Payment } from '@/lib/types';

export default function PaymentPage() {
  const { id } = useParams<{ id: string }>();
  const { reload: reloadMe } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api.get<Payment>(`/payments/${id}`), [id]);

  useEffect(() => {
    if (data?.status === 'pending') {
      const t = setTimeout(() => void reload(), 3000);
      return () => clearTimeout(t);
    }
    if (data?.status === 'succeeded') void reloadMe();
  }, [data, reload, reloadMe]);

  if (loading && !data) return <Spinner />;
  if (error || !data) return <ErrorNotice error={error} />;
  const plan = PLANS[data.planId];

  return (
    <div className="mx-auto max-w-md pt-10">
      <Card className="text-center">
        {data.status === 'pending' && <Loader2 className="mx-auto h-12 w-12 animate-spin text-navy-700" />}
        {data.status === 'succeeded' && <CheckCircle2 className="mx-auto h-12 w-12 text-ok-600" />}
        {(data.status === 'failed' || data.status === 'refunded') && <XCircle className="mx-auto h-12 w-12 text-maple-600" />}
        <p className="mt-3 text-xl font-bold text-navy-900">
          {data.status === 'pending' ? 'Paiement en attente' : data.status === 'succeeded' ? `${plan.name} activé !` : 'Paiement non abouti'}
        </p>
        <p className="mt-1 text-sm text-muted">
          {data.status === 'pending'
            ? (data.method === 'stripe' ? 'Nous attendons la confirmation de votre banque.' : 'Validez le paiement sur votre téléphone (code secret Mobile Money). Cette page se met à jour automatiquement.')
            : data.status === 'succeeded' ? `${money(data.amount)} reçus. Bonne préparation !` : 'Aucun montant n’a été débité. Vous pouvez réessayer avec un autre moyen de paiement.'}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          {data.status === 'pending' && data.checkoutUrl && <a href={data.checkoutUrl} className="inline-flex h-10 items-center rounded-lg bg-maple-600 px-4 text-sm font-semibold text-white">Ouvrir la page de paiement</a>}
          {data.status === 'succeeded' && <LinkButton href="/tableau-de-bord">Aller au tableau de bord</LinkButton>}
          {data.status === 'failed' && <LinkButton href="/profil">Réessayer</LinkButton>}
        </div>
      </Card>
    </div>
  );
}
