import type { Metadata } from 'next';
import { H2, LegalPage } from '@/components/legal-page';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = { title: 'Mentions légales', alternates: { canonical: '/mentions-legales' } };

export default function LegalNotice() {
  return (
    <LegalPage title="Mentions légales">
      <H2>Éditeur</H2>
      <p>
        Le site C2Pass est édité par {LEGAL.company} ({LEGAL.legalForm}), immatriculée sous le numéro {LEGAL.registration}, dont le siège est situé {LEGAL.address}.
        Directeur de la publication : {LEGAL.director}. Contact : <a className="underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>
      <H2>Hébergement</H2>
      <p>{LEGAL.host}</p>
      <H2>Marques</H2>
      <p>
        TCF et TCF Canada sont des marques de France Éducation international (FEI). C2Pass est un service de préparation indépendant : il n’est ni affilié à FEI,
        ni à Immigration, Réfugiés et Citoyenneté Canada, ni aux centres d’examen, et ne délivre aucun résultat officiel.
      </p>
      <H2>Informations sur les centres d’examen</H2>
      <p>
        Les statuts des centres (ouvert, complet, fermé) sont déduits des pages publiques des centres ou saisis par notre équipe. Ils sont fournis à titre indicatif :
        seule l’inscription sur le site officiel du centre fait foi. C2Pass n’effectue aucune réservation à votre place.
      </p>
    </LegalPage>
  );
}
