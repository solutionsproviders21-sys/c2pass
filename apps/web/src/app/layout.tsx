import type { Metadata, Viewport } from 'next';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import { AuthProvider } from '@/lib/auth';

export const metadata: Metadata = {
  title: { default: 'C2Pass – Préparation TCF Canada niveau C2', template: '%s · C2Pass' },
  description: 'Préparez le TCF Canada jusqu’au niveau C2 : entraînement par compétence, simulateur en conditions réelles, correction IA et alertes d’ouverture des centres d’examen en Afrique centrale.',
};

export const viewport: Viewport = { themeColor: '#0b1f3a', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
