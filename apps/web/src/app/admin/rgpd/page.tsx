'use client';

import { Printer } from 'lucide-react';
import { RequireAuth } from '@/components/require-auth';
import { Badge, Button, Card, ErrorNotice, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { dateTime } from '@/lib/format';
import { LEGAL } from '@/lib/legal';

interface Activity {
  id: string; name: string; purpose: string; legalBasis: string; subjects: string; data: string; retention: string; security: string;
  records: number | null;
  processors: { name: string; role: string; active: boolean; transfer: boolean }[];
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-line py-2 sm:grid-cols-[12rem_1fr]">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Register() {
  const reg = useLoad(() => api.get<{ generatedAt: string; activities: Activity[] }>('/admin/gdpr/register'));
  return (
    <>
      <PageHeader
        title="Registre des traitements (RGPD)"
        subtitle="Article 30 du RGPD. Généré à partir du fonctionnement réel de la plateforme et des prestataires branchés sur ce serveur."
        actions={<Button variant="secondary" onClick={() => window.print()} className="print:hidden"><Printer className="h-4 w-4" />Imprimer / PDF</Button>}
      />
      <Card className="mb-4">
        <dl>
          <Row label="Responsable du traitement">{LEGAL.company}, {LEGAL.legalForm}, {LEGAL.registration}, {LEGAL.address}</Row>
          <Row label="Représentant">{LEGAL.director}</Row>
          <Row label="Contact données personnelles">{LEGAL.privacyEmail}</Row>
          <Row label="Hébergeur">{LEGAL.host}</Row>
          {reg.data && <Row label="Établi le">{dateTime(reg.data.generatedAt)}</Row>}
        </dl>
      </Card>
      {reg.loading ? <Spinner /> : !reg.data ? <ErrorNotice error={reg.error} /> : (
        <div className="space-y-4">
          {reg.data.activities.map((a, i) => (
            <Card key={a.id} className="break-inside-avoid">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold text-navy-900">{i + 1}. {a.name}</h2>
                {a.records !== null && <span className="text-xs text-muted">{a.records.toLocaleString('fr-FR')} enregistrement(s) actuellement</span>}
              </div>
              <dl className="mt-2">
                <Row label="Finalité">{a.purpose}</Row>
                <Row label="Base légale">{a.legalBasis}</Row>
                <Row label="Personnes concernées">{a.subjects}</Row>
                <Row label="Données">{a.data}</Row>
                <Row label="Destinataires">
                  {a.processors.length === 0 ? 'Aucun prestataire : données traitées sur le serveur de C2Pass uniquement.' : (
                    <ul className="space-y-1">
                      {a.processors.map((p) => (
                        <li key={p.name} className="flex flex-wrap items-center gap-2">
                          <span>{p.name} ({p.role})</span>
                          {p.active ? <Badge tone="ok">branché</Badge> : <Badge tone="gray">non branché</Badge>}
                          {p.active && p.transfer && <Badge tone="warn">transfert hors d’Afrique centrale</Badge>}
                        </li>
                      ))}
                    </ul>
                  )}
                </Row>
                <Row label="Durée de conservation">{a.retention}</Row>
                <Row label="Mesures de sécurité">{a.security}</Row>
              </dl>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

export default function RgpdPage() {
  return <RequireAuth roles={['admin']}><Register /></RequireAuth>;
}
