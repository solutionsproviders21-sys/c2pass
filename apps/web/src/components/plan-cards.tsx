'use client';

import { Check } from 'lucide-react';
import { PLANS, type PlanId } from '@c2pass/shared';
import { money } from '@/lib/format';
import { Badge, Button, Card, cx, LinkButton } from './ui';

const EXTRA: Record<PlanId, string[]> = {
  free: ['Fiches de méthode', 'Score indicatif en expression écrite'],
  standard: ['Statistiques détaillées par compétence', 'Alertes e-mail, SMS et WhatsApp'],
  pro: ['Simulations illimitées', 'Coffre-fort pré-remplissage'],
  reussite: ['Correcteur humain et IA avancée', 'Alertes prioritaires'],
};

export function PlanCards({ current, onChoose }: { current?: PlanId; onChoose?: (id: PlanId) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Object.values(PLANS).map((p) => {
        const featured = p.id === 'pro';
        const isCurrent = current === p.id;
        return (
          <Card key={p.id} className={cx('flex flex-col', featured && 'border-maple-600 ring-1 ring-maple-600')}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-navy-900">{p.name}</p>
              {featured && <Badge tone="maple">Le plus choisi</Badge>}
              {p.c2Guarantee && <Badge tone="gold">Garantie C2</Badge>}
            </div>
            <p className="mt-3 text-3xl font-bold text-navy-900">{p.priceXaf ? money(p.priceXaf) : '0 FCFA'}</p>
            <p className="text-xs text-muted">{p.billing === 'monthly' ? 'par mois, sans engagement' : p.billing === 'one_time' ? 'paiement unique pour 3 mois' : 'pour toujours'}</p>
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {[...p.highlights, ...EXTRA[p.id]].map((h) => (
                <li key={h} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-ok-600" />{h}</li>
              ))}
            </ul>
            <div className="mt-6">
              {isCurrent ? (
                <Button variant="secondary" disabled className="w-full">Votre offre actuelle</Button>
              ) : p.id === 'free' ? (
                onChoose ? null : <LinkButton href="/inscription" variant="secondary" className="w-full">Créer un compte</LinkButton>
              ) : onChoose ? (
                <Button className="w-full" variant={featured ? 'primary' : 'navy'} onClick={() => onChoose(p.id)}>Choisir {p.name}</Button>
              ) : (
                <LinkButton href={`/profil?offre=${p.id}`} className="w-full" variant={featured ? 'primary' : 'navy'}>Choisir {p.name}</LinkButton>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
