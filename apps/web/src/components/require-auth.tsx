'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import type { Role } from '@/lib/types';
import { Spinner } from './ui';

/** Client-side guard: tokens live in the browser, the API enforces the real authorisation. */
export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { me, loading } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const allowed = !!me && (!roles || roles.includes(me.role));

  useEffect(() => {
    if (loading) return;
    if (!me) router.replace(`/connexion?suite=${encodeURIComponent(path)}`);
    else if (!allowed) router.replace('/tableau-de-bord');
  }, [loading, me, allowed, path, router]);

  if (loading || !allowed) return <Spinner />;
  return <>{children}</>;
}
