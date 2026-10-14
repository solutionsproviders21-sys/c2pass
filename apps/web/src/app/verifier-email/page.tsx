'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AuthLayout } from '@/components/auth-card';
import { LinkButton, Notice, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function VerifyEmail() {
  const token = useSearchParams().get('jeton') ?? '';
  const { me, reload } = useAuth();
  const [state, setState] = useState<'pending' | 'ok' | 'error'>(token ? 'pending' : 'error');
  const [message, setMessage] = useState('Ce lien est incomplet. Ouvrez le lien reçu par e-mail en entier.');
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true; // the link is single-use: never post it twice (React strict mode, re-renders)
    api.post('/auth/email/verify', { token })
      .then(async () => { setState('ok'); await reload(); })
      .catch((e) => { setMessage(e instanceof ApiError ? e.message : 'Connexion impossible. Réessayez.'); setState('error'); });
  }, [token, reload]);

  return (
    <AuthLayout title="Confirmation de l’adresse e-mail">
      {state === 'pending' && <Spinner />}
      {state === 'ok' && (
        <div className="space-y-4">
          <Notice tone="ok" title="Adresse confirmée">Vous pouvez maintenant activer les alertes d’ouverture des centres et souscrire une offre.</Notice>
          <LinkButton href={me ? '/tableau-de-bord' : '/connexion'} className="w-full">{me ? 'Aller au tableau de bord' : 'Se connecter'}</LinkButton>
        </div>
      )}
      {state === 'error' && (
        <div className="space-y-4">
          <Notice tone="error">{message}</Notice>
          <LinkButton href="/tableau-de-bord" variant="secondary" className="w-full">Demander un nouveau lien</LinkButton>
        </div>
      )}
    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return <Suspense><VerifyEmail /></Suspense>;
}
