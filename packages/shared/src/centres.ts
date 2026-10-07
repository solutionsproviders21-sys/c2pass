export const COUNTRIES = [
  { code: 'CM', name: 'Cameroun' },
  { code: 'GA', name: 'Gabon' },
  { code: 'CG', name: 'Congo' },
  { code: 'TD', name: 'Tchad' },
  { code: 'CD', name: 'RDC' },
  { code: 'CF', name: 'RCA' },
  { code: 'GQ', name: 'Guinée Équatoriale' },
] as const;
export type CountryCode = (typeof COUNTRIES)[number]['code'];

export const CENTRE_STATUSES = ['open', 'closed', 'full', 'soon'] as const;
export type CentreStatus = (typeof CENTRE_STATUSES)[number];

export const CENTRE_STATUS_LABELS: Record<CentreStatus, string> = {
  open: 'Ouvert',
  closed: 'Fermé',
  full: 'Complet',
  soon: 'Bientôt',
};

export const ALERT_CHANNELS = ['email', 'sms', 'whatsapp', 'push'] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

/** A centre becoming bookable is what triggers subscriber alerts. */
export function opensBooking(previous: CentreStatus, next: CentreStatus): boolean {
  return next === 'open' && previous !== 'open';
}
