'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Bell, BookOpen, ChartLine, LayoutDashboard, LogOut, MapPin, Menu, ShieldCheck, Timer, User, Vault, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Logo } from './logo';
import { Badge, cx } from './ui';

export interface NavItem { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean }

const STUDENT_NAV: NavItem[] = [
  { href: '/tableau-de-bord', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/entrainement', label: 'Entraînement', icon: BookOpen },
  { href: '/simulateur', label: 'Simulateur d’examen', icon: Timer },
  { href: '/scores', label: 'Mes scores', icon: ChartLine },
  { href: '/centres-examen', label: 'Centres d’examen', icon: MapPin },
  { href: '/alertes', label: 'Alertes places', icon: Bell },
  { href: '/coffre-fort', label: 'Coffre-fort', icon: Vault },
  { href: '/profil', label: 'Profil & abonnement', icon: User },
];

export function Shell({ nav, children, footer }: { nav: NavItem[]; children: ReactNode; footer?: ReactNode }) {
  const path = usePathname();
  const { me, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const active = (item: NavItem) => (item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5"><Logo href={nav[0].href} light /></div>
      <nav className="flex-1 space-y-0.5 px-3">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
              active(item) ? 'bg-white/10 text-white' : 'text-navy-100/75 hover:bg-white/5 hover:text-white')}
          >
            <item.icon className={cx('h-4 w-4', active(item) && 'text-maple-500')} />
            {item.label}
          </Link>
        ))}
        {footer}
      </nav>
      {me && (
        <div className="border-t border-white/10 p-4">
          <p className="truncate text-sm font-semibold text-white">{me.firstName || me.email}</p>
          <div className="mt-1 flex items-center justify-between">
            <Badge tone={me.plan.id === 'free' ? 'gray' : 'gold'}>{me.plan.name}</Badge>
            <button onClick={() => void signOut()} className="flex items-center gap-1 text-xs text-navy-100/70 hover:text-white">
              <LogOut className="h-3.5 w-3.5" /> Déconnexion
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-navy-900 lg:block">{sidebar}</aside>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-white px-4 lg:hidden">
        <Logo href={nav[0].href} />
        <button onClick={() => setOpen(true)} aria-label="Ouvrir le menu"><Menu /></button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-navy-900">
            <button className="absolute right-3 top-5 text-white" onClick={() => setOpen(false)} aria-label="Fermer"><X /></button>
            {sidebar}
          </aside>
        </div>
      )}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}

export function StudentShell({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const staff = me && (me.role === 'admin' || me.role === 'teacher');
  return (
    <Shell
      nav={STUDENT_NAV}
      footer={staff ? (
        <Link href={me.role === 'admin' ? '/admin' : '/admin/corrections'} className="mt-4 flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-gold-500 hover:bg-white/5">
          <ShieldCheck className="h-4 w-4" /> Back-office
        </Link>
      ) : null}
    >
      {children}
    </Shell>
  );
}

