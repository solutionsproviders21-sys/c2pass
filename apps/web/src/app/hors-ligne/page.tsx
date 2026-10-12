import type { Metadata } from 'next';
import { WifiOff } from 'lucide-react';
import { Logo } from '@/components/logo';

export const metadata: Metadata = { title: 'Hors connexion' };

export default function Offline() {
  return (
    <main className="grid min-h-screen place-items-center bg-navy-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="flex justify-center"><Logo /></div>
        <WifiOff className="mx-auto mt-6 h-10 w-10 text-muted" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold text-navy-900">Pas de connexion internet</h1>
        <p className="mt-2 text-sm text-muted">
          C2Pass a besoin d’internet pour vos exercices, vos simulations et vos alertes. Vérifiez votre réseau ou vos données mobiles, puis réessayez.
        </p>
        {/* Plain link: a full reload goes back to the network. */}
        <a href="/tableau-de-bord" className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-maple-600 px-5 text-sm font-semibold text-white">Réessayer</a>
      </div>
    </main>
  );
}
