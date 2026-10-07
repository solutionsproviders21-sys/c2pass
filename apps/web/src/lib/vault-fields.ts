import type { VaultData } from './types';

export const VAULT_FIELDS: { key: keyof VaultData; label: string; type?: string; placeholder?: string }[] = [
  { key: 'lastName', label: 'Nom (comme sur le passeport)' },
  { key: 'firstName', label: 'Prénom(s)' },
  { key: 'gender', label: 'Sexe' },
  { key: 'birthDate', label: 'Date de naissance', type: 'date' },
  { key: 'birthPlace', label: 'Lieu de naissance' },
  { key: 'nationality', label: 'Nationalité' },
  { key: 'passportNumber', label: 'Numéro de passeport' },
  { key: 'passportExpiry', label: 'Expiration du passeport', type: 'date' },
  { key: 'address', label: 'Adresse' },
  { key: 'city', label: 'Ville' },
  { key: 'phone', label: 'Téléphone', type: 'tel' },
  { key: 'email', label: 'E-mail', type: 'email' },
  { key: 'motherTongue', label: 'Langue maternelle' },
  { key: 'examReason', label: 'Motif de l’examen', placeholder: 'Immigration (Entrée express)' },
];
