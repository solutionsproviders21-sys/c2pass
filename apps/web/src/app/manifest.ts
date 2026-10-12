import type { MetadataRoute } from 'next';

/** Installable web app: "Ajouter à l'écran d'accueil" on Android and iPhone, until the native app ships. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'C2Pass – Préparation TCF Canada',
    short_name: 'C2Pass',
    description: 'Entraînement, simulateur et alertes d’ouverture des centres TCF Canada en Afrique centrale.',
    lang: 'fr',
    start_url: '/tableau-de-bord?source=app',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#0b1f3a',
    categories: ['education'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Entraînement', url: '/entrainement' },
      { name: 'Simulateur', url: '/simulateur' },
      { name: 'Alertes', url: '/alertes' },
    ],
  };
}
