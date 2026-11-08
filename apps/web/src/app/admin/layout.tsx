'use client';

import { BarChart3, ClipboardCheck, FileQuestion, LayoutDashboard, MapPin, Receipt, ScrollText, ShieldAlert, Ticket, Users } from 'lucide-react';
import Link from 'next/link';
import { Shell, type NavItem } from '@/components/app-shell';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/lib/auth';

const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Indicateurs', icon: BarChart3, exact: true },
  { href: '/admin/centres', label: 'Centres & statuts', icon: MapPin },
  { href: '/admin/questions', label: 'Banque de questions', icon: FileQuestion },
  { href: '/admin/corrections', label: 'Corrections humaines', icon: ClipboardCheck },
  { href: '/admin/utilisateurs', label: 'Utilisateurs', icon: Users },
  { href: '/admin/beta', label: 'Bêta & liste d’attente', icon: Ticket },
  { href: '/admin/paiements', label: 'Paiements & remboursements', icon: Receipt },
  { href: '/admin/fraude', label: 'Anti-fraude', icon: ShieldAlert },
  { href: '/admin/journal', label: 'Journal d’audit', icon: ScrollText },
];
const TEACHER_NAV: NavItem[] = [{ href: '/admin/corrections', label: 'Corrections à faire', icon: ClipboardCheck }];

function AdminShell({ children }: { children: React.ReactNode }) {
  const { me } = useAuth();
  return (
    <Shell
      nav={me?.role === 'admin' ? ADMIN_NAV : TEACHER_NAV}
      footer={
        <Link href="/tableau-de-bord" className="mt-4 flex items-center gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm font-medium text-navy-100/75 hover:bg-white/5">
          <LayoutDashboard className="h-4 w-4" /> Espace étudiant
        </Link>
      }
    >
      {children}
    </Shell>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth roles={['admin', 'teacher']}>
      <AdminShell>{children}</AdminShell>
    </RequireAuth>
  );
}
