import type { Metadata } from 'next';
import { PublicFooter, PublicHeader } from '@/components/public-header';
import { PlanCards } from '@/components/plan-cards';

export const metadata: Metadata = { title: 'Tarifs' };

const FAQ = [
  ['Comment payer ?', 'Par Orange Money, MTN Mobile Money ou carte bancaire (Visa, Mastercard). Vous validez le paiement sur votre téléphone ; l’offre est activée dès la confirmation.'],
  ['Puis-je arrêter quand je veux ?', 'Oui. Les offres mensuelles ne se renouvellent pas automatiquement : vous rachetez un mois quand vous le souhaitez.'],
  ['Comment fonctionne la garantie C2 du Pack Réussite ?', 'Si, après avoir suivi le programme pendant 3 mois (au moins 3 simulations complètes), vous n’obtenez pas le niveau C2 dans une compétence visée, nous vous remboursons sur présentation de votre attestation officielle.'],
  ['C2Pass réserve-t-il ma place à l’examen ?', 'Non, et c’est volontaire : la réservation automatique est interdite par les centres. Nous surveillons légalement les pages publiques et vous alertons immédiatement ; le coffre-fort vous permet ensuite de remplir le formulaire officiel en quelques secondes.'],
];

export default function Tarifs() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-6xl px-4 py-14">
        <h1 className="h-serif text-center text-4xl font-bold text-navy-900">Choisissez votre rythme vers le C2</h1>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted">Commencez gratuitement, passez à Premium quand vous préparez activement votre date d’examen.</p>
        <div className="mt-10"><PlanCards /></div>
        <div className="mx-auto mt-16 max-w-3xl">
          <h2 className="h-serif text-2xl font-bold text-navy-900">Questions fréquentes</h2>
          <div className="mt-4 divide-y divide-line rounded-xl border border-line bg-white">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group p-4">
                <summary className="cursor-pointer list-none font-semibold text-navy-900">{q}</summary>
                <p className="mt-2 text-sm text-muted">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
