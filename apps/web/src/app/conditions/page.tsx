import type { Metadata } from 'next';
import Link from 'next/link';
import { H2, LegalPage, List } from '@/components/legal-page';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = { title: 'Conditions générales d’utilisation et de vente', alternates: { canonical: '/conditions' } };

export default function Terms() {
  return (
    <LegalPage title="Conditions générales d’utilisation et de vente">
      <H2>1. Objet</H2>
      <p>
        Les présentes conditions régissent l’utilisation du service C2Pass, plateforme de préparation au TCF Canada éditée par {LEGAL.company}, et la vente de ses offres.
        En créant un compte, vous les acceptez.
      </p>
      <H2>2. Compte</H2>
      <List>
        <li>Vous fournissez des informations exactes et confirmez votre adresse e-mail. Elle est nécessaire pour recevoir les alertes et souscrire une offre.</li>
        <li>Votre compte est personnel. Vous gardez votre mot de passe confidentiel ; le partage d’un compte entre plusieurs personnes est interdit et peut entraîner sa suspension.</li>
        <li>Vous pouvez supprimer votre compte à tout moment depuis votre profil.</li>
      </List>
      <H2>3. Le service</H2>
      <List>
        <li>Entraînement par compétence, simulateur d’examen, corrections automatiques et, selon l’offre, corrections par un correcteur humain.</li>
        <li>Les scores et niveaux affichés sont des estimations pédagogiques. Ils ne remplacent pas un résultat officiel du TCF Canada.</li>
        <li>Les alertes d’ouverture des centres sont envoyées dès qu’un changement est détecté, sans garantie de places : C2Pass n’effectue aucune réservation et ne contourne aucun dispositif des sites officiels.</li>
      </List>
      <H2>4. Règles d’utilisation</H2>
      <p>
        Il est interdit de copier ou diffuser les contenus (questions, documents sonores, fiches), d’automatiser l’accès au service, de tenter de contourner les règles du simulateur
        ou les quotas des offres. Les signaux de fraude (appareils partagés, sorties de page pendant un examen) sont enregistrés.
      </p>
      <H2>5. Offres et prix</H2>
      <p>
        Les offres et leurs prix en francs CFA (XAF) sont présentés sur la page <Link className="underline" href="/tarifs">Tarifs</Link>. Premium Standard et Premium Pro sont souscrits pour un mois ;
        le Pack Réussite pour trois mois, en paiement unique. Une offre n’est pas renouvelée automatiquement : vous la renouvelez si vous le souhaitez.
      </p>
      <H2>6. Paiement</H2>
      <p>
        Le paiement s’effectue par Orange Money, MTN Mobile Money ou carte bancaire (Stripe). L’offre est activée dès la confirmation du paiement par le prestataire.
        C2Pass ne conserve aucune donnée de carte bancaire.
      </p>
      <H2>7. Garantie C2 du Pack Réussite</H2>
      <p>
        Le Pack Réussite est assorti de la garantie décrite sur la page Tarifs : si, après avoir suivi le programme pendant 3 mois (au moins 3 simulations complètes),
        vous n’obtenez pas le niveau C2 dans une compétence visée, le prix du Pack vous est remboursé sur présentation de votre attestation officielle,
        à adresser à <a className="underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>
      <H2>8. Rétractation et remboursement</H2>
      <p>
        Une offre peut être annulée et remboursée sur simple demande dans les 7 jours suivant le paiement si elle n’a pas été utilisée (aucune simulation ni correction humaine).
        Au-delà, le service ayant commencé, l’offre court jusqu’à son terme.
      </p>
      <H2>9. Disponibilité et responsabilité</H2>
      <p>
        Nous faisons nos meilleurs efforts pour que le service soit disponible et exact, sans pouvoir le garantir en permanence. C2Pass ne saurait être tenu responsable
        d’un résultat à l’examen, d’une place non obtenue dans un centre ou d’une indisponibilité des réseaux de télécommunication.
      </p>
      <H2>10. Données personnelles</H2>
      <p>Leur traitement est décrit dans la <Link className="underline" href="/confidentialite">politique de confidentialité</Link>.</p>
      <H2>11. Modification et contact</H2>
      <p>
        Ces conditions peuvent évoluer ; la version en vigueur est celle publiée sur cette page. Pour toute question ou réclamation :{' '}
        <a className="underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>.
      </p>
    </LegalPage>
  );
}
