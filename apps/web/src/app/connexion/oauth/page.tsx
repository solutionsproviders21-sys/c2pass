'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';
import { Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import type { Tokens } from '@/lib/types';

function Exchange() {
  const params = useSearchParams();
  const router = useRouter();
  const { signIn } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const code = params.get('code');
    if (!code) {
      router.replace('/connexion?erreur=oauth_state');
      return;
    }
    api.post<Tokens>('/auth/oauth/exchange', { code })
      .then(async (t) => router.replace(homeFor(await signIn(t))))
      .catch(() => router.replace('/connexion?erreur=oauth_state'));
  }, [params, router, signIn]);

  return <Spinner label="Connexion en cours…" />;
}

export default function OAuthPage() {
  return <Suspense><Exchange /></Suspense>;
}
