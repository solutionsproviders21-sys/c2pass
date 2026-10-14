import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    // Personal spaces, exams and the back-office have nothing to index.
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/admin', '/examen/', '/tableau-de-bord', '/entrainement', '/simulateur', '/resultats/', '/scores', '/alertes', '/coffre-fort', '/profil', '/paiement/', '/fiches/', '/centres-examen', '/mot-de-passe', '/verifier-email', '/connexion/oauth'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
