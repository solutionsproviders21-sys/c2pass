'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { AuthFooter, AuthLayout } from '@/components/auth-card';
import { Button, ErrorNotice, Field, Input, Notice } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const action = useAction();

  return (
    <AuthLayout title="Mot de passe oublié" subtitle="Recevez un lien pour choisir un nouveau mot de passe.">
      {sent ? (
        <Notice tone="ok" title="Vérifiez votre boîte e-mail">
          <p>Si un compte existe pour {email}, un lien vient d’être envoyé. Il est valable 1 heure et ne sert qu’une fois. Pensez à regarder dans les courriers indésirables.</p>
        </Notice>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await action.run(async () => { await api.post('/auth/password/forgot', { email }); return true; });
            if (ok) setSent(true);
          }}
        >
          <Field label="Adresse e-mail du compte"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <ErrorNotice error={action.error} />
          <Button type="submit" busy={action.busy} className="w-full"><MailCheck className="h-4 w-4" />Envoyer le lien</Button>
        </form>
      )}
      <AuthFooter><Link href="/connexion" className="font-semibold text-maple-600">Retour à la connexion</Link></AuthFooter>
    </AuthLayout>
  );
}
