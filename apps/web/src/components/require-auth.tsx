'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { Button, Notice, Spinner } from './ui';

/** Client-side guard: tokens live in the browser, the API enforces the real authorisation. */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { me, loading, offline, reload } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const allowed = !!me && (!roles || roles.includes(me.role));

  useEffect(() => {
    if (loading || (offline && !me)) return;
    if (!me) router.replace(`/connexion?suite=${encodeURIComponent(path)}`);
    else if (!allowed) router.replace('/tableau-de-bord');
  }, [loading, offline, me, allowed, path, router]);

  if (offline && !me) {
    return (
      <div className="mx-auto mt-16 max-w-md px-4">
        <Notice tone="warn" title="Pas de connexion internet">Vérifiez votre réseau ou vos données mobiles. Votre session est conservée.</Notice>
        <Button className="mt-4" onClick={() => void reload()}>Réessayer</Button>
      </div>
    );
  }

  if (loading || !allowed) return <Spinner />;
  return <>{children}</>;
}
