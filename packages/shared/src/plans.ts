/** Freemium model (cahier des charges §8, scénario A). Prices in FCFA. */

export const PLAN_IDS = ['free', 'standard', 'pro', 'reussite'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type AiTier = 'none' | 'base' | 'advanced';

export interface Plan {
  id: PlanId;
  name: string;
  priceXaf: number;
  billing: 'free' | 'monthly' | 'one_time';
  /** Access length bought by one payment, in days (null = free forever). */
  durationDays: number | null;
  /** Thematic exercises per day (null = unlimited). */
  exercisesPerDay: number | null;
  /** Full exam simulations per calendar month (null = unlimited). */
  simulationsPerMonth: number | null;
  /** Exam-centre alert subscriptions (0 = none, null = unlimited). */
  centreAlerts: number | null;
  priorityAlerts: boolean;
  ai: AiTier;
  humanCorrection: boolean;
  c2Guarantee: boolean;
  highlights: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free', name: 'Gratuit', priceXaf: 0, billing: 'free', durationDays: null,
    exercisesPerDay: 5, simulationsPerMonth: 1, centreAlerts: 0, priorityAlerts: false,
    ai: 'none', humanCorrection: false, c2Guarantee: false,
    highlights: ['5 exercices par jour', '1 simulation complète par mois', 'Carte des centres d’examen'],
  },
  standard: {
    id: 'standard', name: 'Premium Standard', priceXaf: 9_900, billing: 'monthly', durationDays: 30,
    exercisesPerDay: null, simulationsPerMonth: 3, centreAlerts: 3, priorityAlerts: false,
    ai: 'base', humanCorrection: false, c2Guarantee: false,
    highlights: ['Exercices illimités', '3 simulations par mois', 'Alertes sur 3 centres', 'Correction IA de base'],
  },
  pro: {
    id: 'pro', name: 'Premium Pro', priceXaf: 19_900, billing: 'monthly', durationDays: 30,
    exercisesPerDay: null, simulationsPerMonth: null, centreAlerts: null, priorityAlerts: true,
    ai: 'advanced', humanCorrection: true, c2Guarantee: false,
    highlights: ['Tout Standard', 'Alertes illimitées et prioritaires', 'IA avancée (calibrée C2)', 'Correcteur humain certifié'],
  },
  reussite: {
    id: 'reussite', name: 'Pack Réussite', priceXaf: 49_900, billing: 'one_time', durationDays: 90,
    exercisesPerDay: null, simulationsPerMonth: null, centreAlerts: null, priorityAlerts: true,
    ai: 'advanced', humanCorrection: true, c2Guarantee: true,
    highlights: ['Accès Pro pendant 3 mois', 'Garantie C2 ou remboursement'],
  },
};

export function planOf(id: string | null | undefined): Plan {
  return PLANS[(id as PlanId) in PLANS ? (id as PlanId) : 'free'];
}

/** The plan actually in force: a paid plan only counts until it expires. */
export function effectivePlan(planId: string | null | undefined, expiresAt: Date | string | null | undefined, now = new Date()): Plan {
  const plan = planOf(planId);
  if (plan.id === 'free') return plan;
  if (!expiresAt || new Date(expiresAt) <= now) return PLANS.free;
  return plan;
}

export function formatXaf(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(amount).replace(/\u202f|\u00a0/g, ' ')} FCFA`;
}
