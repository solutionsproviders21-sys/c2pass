import Link from 'next/link';

export function MapleLeaf({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <path fill="currentColor" d="M256 16l-41 76c-5 8-13 7-21 3l-30-15 22 117c5 21-10 21-17 12l-52-58-8 29c-1 4-5 8-11 7l-66-14 17 63c4 14 7 20-3 24l-24 11 113 92c5 4 7 11 5 17l-10 32c39-4 74-11 113-15 4 0 10 6 10 10l-5 133h18l-3-133c0-4 5-10 9-10 39 4 74 11 113 15l-10-32c-2-6 0-13 5-17l113-92-24-11c-10-4-7-10-3-24l17-63-66 14c-6 1-10-3-11-7l-8-29-52 58c-7 9-22 9-17-12l22-117-30 15c-8 4-16 5-21-3z" />
    </svg>
  );
}

export function Logo({ href = '/', light = false }: { href?: string; light?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2" aria-label="C2Pass, accueil">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-maple-600 text-white shadow-sm">
        <MapleLeaf className="h-5 w-5" />
      </span>
      <span className={`text-xl font-extrabold tracking-tight ${light ? 'text-white' : 'text-navy-900'}`}>
        C2<span className="text-maple-600">Pass</span>
      </span>
    </Link>
  );
}
