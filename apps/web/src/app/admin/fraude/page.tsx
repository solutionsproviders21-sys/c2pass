'use client';

import { Card, ErrorNotice, PageHeader, Spinner } from '@/components/ui';
import { RequireAuth } from '@/components/require-auth';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { dateTime } from '@/lib/format';

interface Fraud {
  sharedFingerprints: { fingerprint: string; accounts: number; emails: string[]; lastSeen: string }[];
  examEvents: { email: string; event: string; n: number; lastSeen: string }[];
}
const EVENTS: Record<string, string> = { exam_blur: 'Sortie de page', exam_copy: 'Tentative de copie', exam_paste: 'Tentative de collage', exam_contextmenu: 'Clic droit', exam_fullscreen_exit: 'Sortie du plein écran' };

function FraudView() {
  const { data, error, loading } = useLoad(() => api.get<Fraud>('/admin/fraud'));
  if (loading) return <Spinner />;
  if (error || !data) return <ErrorNotice error={error} />;
  return (
    <>
      <PageHeader title="Anti-fraude" subtitle="Empreintes de navigateur partagées par plusieurs comptes et comportements suspects pendant les examens." />
      <Card>
        <p className="font-semibold text-navy-900">Appareils utilisés par plusieurs comptes</p>
        {data.sharedFingerprints.length === 0 ? <p className="mt-2 text-sm text-muted">Rien à signaler.</p> : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted"><tr><th className="py-2">Empreinte</th><th>Comptes</th><th>E-mails</th><th>Vu le</th></tr></thead>
            <tbody>{data.sharedFingerprints.map((f) => (
              <tr key={f.fingerprint} className="border-t border-line"><td className="py-2 font-mono text-xs">{f.fingerprint.slice(0, 12)}…</td><td className="font-semibold">{f.accounts}</td><td>{f.emails.join(', ')}</td><td>{dateTime(f.lastSeen)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      <Card className="mt-4">
        <p className="font-semibold text-navy-900">Événements répétés pendant les examens (30 jours, ≥ 3)</p>
        {data.examEvents.length === 0 ? <p className="mt-2 text-sm text-muted">Rien à signaler.</p> : (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted"><tr><th className="py-2">Candidat</th><th>Événement</th><th>Nombre</th><th>Dernier</th></tr></thead>
            <tbody>{data.examEvents.map((e, i) => (
              <tr key={i} className="border-t border-line"><td className="py-2">{e.email}</td><td>{EVENTS[e.event] ?? e.event}</td><td className="font-semibold">{e.n}</td><td>{dateTime(e.lastSeen)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </>
  );
}

export default function FraudPage() {
  return <RequireAuth roles={['admin']}><FraudView /></RequireAuth>;
}
