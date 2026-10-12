'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuthFooter, AuthLayout } from '@/components/auth-card';
import { Button, ErrorNotice, Field, Input, LinkButton, Notice } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';

function NewPassword() {
  const token = useSearchParams().get('jeton') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const action = useAction();
  const mismatch = confirm.length > 0 && confirm !== password;

  if (!token) {
    return (
      <AuthLayout title="Lien incomplet">
        <Notice tone="error">Ce lien de réinitialisation est incomplet. Ouvrez le lien reçu par e-mail en entier, ou demandez-en un nouveau.</Notice>
        <AuthFooter><Link href="/mot-de-passe-oublie" className="font-semibold text-maple-600">Demander un nouveau lien</Link></AuthFooter>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Nouveau mot de passe" subtitle="Vous serez déconnecté de tous vos appareils.">
      {done ? (
        <div className="space-y-4">
          <Notice tone="ok" title="Mot de passe modifié">Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</Notice>
          <LinkButton href="/connexion" className="w-full">Se connecter</LinkButton>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (mismatch) return;
            const ok = await action.run(async () => { await api.post('/auth/password/reset', { token, password }); return true; });
            if (ok) setDone(true);
          }}
        >
          <Field label="Nouveau mot de passe" hint="8 caractères minimum."><Input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label="Confirmer" error={mismatch ? 'Les deux mots de passe sont différents.' : null}><Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
          <ErrorNotice error={action.error} />
          <Button type="submit" busy={action.busy} disabled={mismatch} className="w-full">Enregistrer</Button>
          {action.error && <p className="text-center text-sm"><Link href="/mot-de-passe-oublie" className="text-navy-700 underline">Demander un nouveau lien</Link></p>}
        </form>
      )}
    </AuthLayout>
  );
}

export default function NewPasswordPage() {
  return <Suspense><NewPassword /></Suspense>;
}
