'use client';

import { CentresExplorer } from '@/components/centres-explorer';
import { PageHeader } from '@/components/ui';

export default function CentresInApp() {
  return (
    <>
      <PageHeader title="Centres d’examen" subtitle="Statuts en temps réel des centres TCF Canada en Afrique centrale." />
      <CentresExplorer signedIn />
    </>
  );
}
