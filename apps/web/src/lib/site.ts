/** Public address of the site (canonical links, sitemap). Set NEXT_PUBLIC_SITE_URL at build time in production. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
