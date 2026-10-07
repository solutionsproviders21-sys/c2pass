import type { CentreStatus, CountryCode } from '@c2pass/shared';

export interface SeedCentre {
  name: string;
  country: CountryCode;
  city: string;
  lat: number;
  lng: number;
  status: CentreStatus;
  /** Days from today of the next known session (demo data, to be maintained by administrators). */
  nextSessionInDays: number | null;
  seatsLeft: number | null;
}

/**
 * Demonstration directory of the sub-region (cahier des charges, module 3).
 * Names and cities only; addresses, phones, fees and booking links are entered by administrators
 * from the official sources before launch.
 */
export const CENTRES: SeedCentre[] = [
  { name: 'Institut français du Cameroun – Yaoundé', country: 'CM', city: 'Yaoundé', lat: 3.8667, lng: 11.5167, status: 'open', nextSessionInDays: 45, seatsLeft: 5 },
  { name: 'Institut français du Cameroun – Douala', country: 'CM', city: 'Douala', lat: 4.0469, lng: 9.7006, status: 'full', nextSessionInDays: 30, seatsLeft: 0 },
  { name: 'Institut français du Gabon', country: 'GA', city: 'Libreville', lat: 0.3901, lng: 9.4544, status: 'open', nextSessionInDays: 52, seatsLeft: 3 },
  { name: 'Institut français du Congo – Brazzaville', country: 'CG', city: 'Brazzaville', lat: -4.2694, lng: 15.2711, status: 'open', nextSessionInDays: 60, seatsLeft: 4 },
  { name: 'Institut français du Congo – Pointe-Noire', country: 'CG', city: 'Pointe-Noire', lat: -4.7889, lng: 11.8653, status: 'closed', nextSessionInDays: null, seatsLeft: null },
  { name: 'Institut français du Tchad', country: 'TD', city: 'N’Djamena', lat: 12.1067, lng: 15.0444, status: 'soon', nextSessionInDays: 66, seatsLeft: 2 },
  { name: 'Institut français de Kinshasa', country: 'CD', city: 'Kinshasa', lat: -4.3036, lng: 15.3080, status: 'full', nextSessionInDays: 80, seatsLeft: 0 },
  { name: 'Alliance française de Bangui', country: 'CF', city: 'Bangui', lat: 4.3612, lng: 18.5550, status: 'closed', nextSessionInDays: null, seatsLeft: null },
  { name: 'Institut français de Malabo', country: 'GQ', city: 'Malabo', lat: 3.7523, lng: 8.7741, status: 'closed', nextSessionInDays: null, seatsLeft: null },
];
