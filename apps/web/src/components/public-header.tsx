'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { homeFor, useAuth } from '@/lib/auth';
import { Logo } from './logo';
import { LinkButton } from './ui';

const LINKS = [
  { href: '/#methode', label: 'Méthode' },
  { href: '/#simulateur', label: 'Simulateur' },
  { href: '/centres', label: 'Centres d’examen' },
  { href: '/tarifs', label: 'Tarifs' },
];

export function PublicHeader() {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm font-medium text-navy-800 md:flex">
          {LINKS.map((l) => <Link key={l.href} href={l.href} className="hover:text-maple-600">{l.label}</Link>)}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {me ? (
            <LinkButton href={homeFor(me)} variant="navy">Mon espace</LinkButton>
          ) : (
            <>
              <LinkButton href="/connexion" variant="ghost">Connexion</LinkButton>
              <LinkButton href="/inscription">Commencer gratuitement</LinkButton>
            </>
          )}
        </div>
        <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X /> : <Menu />}</button>
      </div>
      {open && (
        <div className="border-t border-line bg-white px-4 py-3 md:hidden">
          {LINKS.map((l) => <Link key={l.href} href={l.href} className="block py-2 font-medium text-navy-800" onClick={() => setOpen(false)}>{l.label}</Link>)}
          <div className="mt-2 flex gap-2">
            {me ? <LinkButton href={homeFor(me)} variant="navy">Mon espace</LinkButton> : (
              <>
                <LinkButton href="/connexion" variant="secondary">Connexion</LinkButton>
                <LinkButton href="/inscription">S’inscrire</LinkButton>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="bg-navy-950 text-navy-100">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo light />
          <p className="mt-3 max-w-sm text-sm text-navy-100/70">
            La plateforme de préparation au TCF Canada pensée pour les candidats d’Afrique centrale : Cameroun, Gabon, Congo, Tchad, RDC, RCA et Guinée Équatoriale.
          </p>
        </div>
        <div className="text-sm">
          <p className="mb-2 font-semibold text-white">Produit</p>
          <Link href="/tarifs" className="block py-1 hover:text-white">Tarifs</Link>
          <Link href="/centres" className="block py-1 hover:text-white">Centres d’examen</Link>
          <Link href="/inscription" className="block py-1 hover:text-white">Créer un compte</Link>
        </div>
        <div className="text-sm">
          <p className="mb-2 font-semibold text-white">Confiance</p>
          <p className="py-1">Données chiffrées (AES-256)</p>
          <p className="py-1">Conforme RGPD</p>
          <p className="py-1">Alertes légales, sans robot</p>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-navy-100/60">
        © {new Date().getFullYear()} C2Pass. TCF Canada est une marque de France Éducation international ; C2Pass n’est pas affilié à FEI.
      </div>
    </footer>
  );
}
