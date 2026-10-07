'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { COUNTRIES } from '@c2pass/shared';
import { AuthFooter, AuthLayout, OAuthButtons } from '@/components/auth-card';
import { Button, ErrorNotice, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fingerprint } from '@/lib/fingerprint';
import { useAction } from '@/lib/hooks';
import type { Tokens } from '@/lib/types';

export default function Register() {
  const router = useRouter();
  const { signIn } = useAuth();
  const action = useAction();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', password: '', country: 'CM', city: '', phone: '', acceptTerms: false, marketingConsent: false });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const tokens = await action.run(async () => api.post<Tokens>('/auth/register', {
      ...f, city: f.city || undefined, phone: f.phone.trim() || undefined, fingerprint: await fingerprint(),
    }));
    if (tokens) {
      await signIn(tokens);
      router.replace('/tableau-de-bord?bienvenue=1');
    }
  }

  return (
    <AuthLayout title="Créez votre compte" subtitle="Gratuit, sans carte bancaire. 5 exercices par jour et 1 simulation par mois.">
      <OAuthButtons />
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prénom"><Input required autoComplete="given-name" value={f.firstName} onChange={set('firstName')} /></Field>
          <Field label="Nom"><Input required autoComplete="family-name" value={f.lastName} onChange={set('lastName')} /></Field>
        </div>
        <Field label="Adresse e-mail"><Input type="email" required autoComplete="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Mot de passe" hint="8 caractères minimum."><Input type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pays">
            <Select value={f.country} onChange={set('country')}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</Select>
          </Field>
          <Field label="Ville"><Input value={f.city} onChange={set('city')} placeholder="Yaoundé" /></Field>
        </div>
        <Field label="Téléphone (facultatif)" hint="Pour recevoir les alertes par SMS et WhatsApp."><Input type="tel" value={f.phone} onChange={set('phone')} placeholder="+237 6 99 00 00 00" /></Field>
        <label className="flex gap-2 text-sm">
          <input type="checkbox" required checked={f.acceptTerms} onChange={set('acceptTerms')} className="mt-0.5" />
          <span>J’accepte les conditions d’utilisation et la politique de confidentialité (RGPD).</span>
        </label>
        <label className="flex gap-2 text-sm text-muted">
          <input type="checkbox" checked={f.marketingConsent} onChange={set('marketingConsent')} className="mt-0.5" />
          <span>Je souhaite recevoir des conseils de préparation par e-mail.</span>
        </label>
        <ErrorNotice error={action.error} />
        <Button type="submit" busy={action.busy} className="w-full">Créer mon compte</Button>
      </form>
      <AuthFooter>Déjà inscrit ? <Link href="/connexion" className="font-semibold text-maple-600">Se connecter</Link></AuthFooter>
    </AuthLayout>
  );
}
