'use client';

import { StudentShell } from '@/components/app-shell';
import { RequireAuth } from '@/components/require-auth';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <StudentShell>{children}</StudentShell>
    </RequireAuth>
  );
}
