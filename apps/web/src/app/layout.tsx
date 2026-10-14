import type { Metadata, Viewport } from 'next';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import { ServiceWorker } from '@/components/service-worker';
import { AuthProvider } from '@/lib/auth';
import { SITE_URL } from '@/lib/site';

const DESCRIPTION = 'Préparez le TCF Canada jusqu’au niveau C2 : entraînement par compétence, simulateur en conditions réelles, correction IA et alertes d’ouverture des centres d’examen en Afrique centrale.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  openGraph: { type: 'website', locale: 'fr_FR', siteName: 'C2Pass', title: 'C2Pass – Préparation TCF Canada niveau C2', description: DESCRIPTION, images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: 'C2Pass' }] },
  twitter: { card: 'summary', title: 'C2Pass – Préparation TCF Canada niveau C2', description: DESCRIPTION },
  title: { default: 'C2Pass – Préparation TCF Canada niveau C2', template: '%s · C2Pass' },
  applicationName: 'C2Pass',
  appleWebApp: { capable: true, title: 'C2Pass', statusBarStyle: 'default' },
  description: DESCRIPTION,
};

export const viewport: Viewport = { themeColor: '#0b1f3a', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>{children}</AuthProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
