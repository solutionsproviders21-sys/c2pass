import Link from 'next/link';
import { PublicFooter, PublicHeader } from '@/components/public-header';

export default function NotFound() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-xl px-4 py-24 text-center">
        <p className="text-sm font-semibold text-maple-600">Erreur 404</p>
        <h1 className="h-serif mt-2 text-3xl font-bold text-navy-900">Cette page n’existe pas</h1>
        <p className="mt-3 text-muted">Le lien est peut-être incomplet ou la page a été déplacée.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className="inline-flex h-10 items-center rounded-lg bg-maple-600 px-5 text-sm font-semibold text-white">Accueil</Link>
          <Link href="/tableau-de-bord" className="inline-flex h-10 items-center rounded-lg border border-line bg-white px-5 text-sm font-semibold text-navy-900">Mon espace</Link>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
