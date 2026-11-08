/**
 * Identity of the company that publishes C2Pass, shown on the legal pages.
 * Set these at build time (Docker build args / .env): until then the pages show "[à compléter]".
 */
const todo = '[à compléter]';
export const LEGAL = {
  company: process.env.NEXT_PUBLIC_LEGAL_COMPANY || todo,
  legalForm: process.env.NEXT_PUBLIC_LEGAL_FORM || todo,
  registration: process.env.NEXT_PUBLIC_LEGAL_REGISTRATION || todo,
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || todo,
  director: process.env.NEXT_PUBLIC_LEGAL_DIRECTOR || todo,
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@c2pass.cm',
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'contact@c2pass.cm',
  host: process.env.NEXT_PUBLIC_LEGAL_HOST || todo,
  updatedAt: '8 novembre 2026',
};
