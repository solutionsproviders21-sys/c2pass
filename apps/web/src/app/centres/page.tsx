'use client';

import { PublicFooter, PublicHeader } from '@/components/public-header';
import { CentresExplorer } from '@/components/centres-explorer';
import { useAuth } from '@/lib/auth';

export default function CentresPublic() {
  const { me } = useAuth();
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="h-serif text-3xl font-bold text-navy-900">Centres d’examen TCF Canada en Afrique centrale</h1>
        <p className="mt-2 max-w-3xl text-muted">Statut des inscriptions mis à jour par notre équipe et par une surveillance automatique des pages publiques des centres (toutes les 5 à 10 minutes, dans le respect de leurs conditions d’utilisation).</p>
        <div className="mt-8"><CentresExplorer signedIn={!!me} /></div>
      </main>
      <PublicFooter />
    </>
  );
}
