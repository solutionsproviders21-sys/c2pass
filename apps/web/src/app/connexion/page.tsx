'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { AuthFooter, AuthLayout, OAuthButtons } from '@/components/auth-card';
import { TotpQr } from '@/components/totp-qr';
import { Button, ErrorNotice, Field, Input, Notice } from '@/components/ui';
import { api } from '@/lib/api';
import { homeFor, useAuth } from '@/lib/auth';
import { fingerprint } from '@/lib/fingerprint';
import { useAction } from '@/lib/hooks';
import type { LoginResult, Tokens } from '@/lib/types';

const OAUTH_ERRORS: Record<string, string> = {
  oauth_state: 'La connexion a expiré, veuillez réessayer.',
  oauth_failed: 'La connexion avec ce compte a échoué.',
  account_suspended: 'Ce compte est suspendu.',
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<null | { challengeId: string; setup?: { secret: string; otpauthUrl: string } }>(null);
  const action = useAction();
  const oauthError = params.get('erreur');

  async function finish(tokens: Tokens) {
    const me = await signIn(tokens);
    const next = params.get('suite');
    router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : homeFor(me));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await action.run(async () => api.post<LoginResult>('/auth/login', { email, password, fingerprint: await fingerprint() }));
    if (!res) return;
    if ('accessToken' in res) await finish(res);
    else if ('totpSetupRequired' in res) setStep({ challengeId: res.challengeId, setup: { secret: res.secret, otpauthUrl: res.otpauthUrl } });
    else setStep({ challengeId: res.challengeId });
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const res = await action.run(() => api.post<Tokens>('/auth/totp/verify', { challengeId: step!.challengeId, code }));
    if (res) await finish(res);
  }

  if (step) {
    return (
      <AuthLayout title="Double authentification" subtitle={step.setup ? 'Obligatoire pour les comptes administrateurs.' : 'Saisissez le code de votre application d’authentification.'}>
        <form onSubmit={verify} className="space-y-4">
          {step.setup && (
            <>
              <Notice tone="info" title="Première connexion">Scannez ce QR code avec Google Authenticator, Microsoft Authenticator ou 2FAS, puis saisissez le code à 6 chiffres affiché.</Notice>
              <TotpQr url={step.setup.otpauthUrl} secret={step.setup.secret} />
            </>
          )}
          <Field label="Code à 6 chiffres">
            <Input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className="text-center text-lg tracking-[0.5em]" />
          </Field>
          <ErrorNotice error={action.error} />
          <Button type="submit" busy={action.busy} className="w-full"><ShieldCheck className="h-4 w-4" />Vérifier</Button>
          <button type="button" className="w-full text-sm text-muted underline" onClick={() => { setStep(null); setCode(''); }}>Retour</button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Bon retour !" subtitle="Connectez-vous pour reprendre votre préparation.">
      {oauthError && <div className="mb-4"><Notice tone="error">{OAUTH_ERRORS[oauthError] ?? 'Connexion impossible.'}</Notice></div>}
      <OAuthButtons />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Adresse e-mail"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Mot de passe"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <p className="-mt-2 text-right text-sm"><Link href="/mot-de-passe-oublie" className="text-navy-700 hover:underline">Mot de passe oublié ?</Link></p>
        <ErrorNotice error={action.error} />
        <Button type="submit" busy={action.busy} className="w-full">Se connecter</Button>
      </form>
      <AuthFooter>Pas encore de compte ? <Link href="/inscription" className="font-semibold text-maple-600">Créer un compte gratuit</Link></AuthFooter>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
