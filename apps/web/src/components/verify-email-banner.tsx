'use client';

import { useState } from 'react';
import { MailWarning } from 'lucide-react';
import { Button } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Reminder shown until the address is confirmed (needed for alerts and payments). */
export function VerifyEmailBanner() {
  const { me } = useAuth();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!me || me.emailVerified) return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-warn-600/30 bg-warn-50 px-4 py-3 text-sm text-navy-900">
      <MailWarning className="h-5 w-5 shrink-0 text-warn-600" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        Confirmez votre adresse <strong className="break-all">{me.email}</strong> avec le lien reçu par e-mail, pour recevoir les alertes et souscrire une offre.
      </p>
      {sent ? <span className="font-medium text-ok-600">Nouveau lien envoyé.</span> : (
        <Button size="sm" variant="secondary" busy={busy} onClick={async () => {
          setBusy(true);
          try { await api.post('/auth/email/resend'); setSent(true); } finally { setBusy(false); }
        }}>Renvoyer le lien</Button>
      )}
    </div>
  );
}
