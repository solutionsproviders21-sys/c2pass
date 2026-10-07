'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Mic, PenLine } from 'lucide-react';
import { Badge, cx, Empty, ErrorNotice, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import { dateTime } from '@/lib/format';

interface Review { id: string; submissionId: string; kind: 'writing' | 'speaking'; status: string; score: number | null; createdAt: string; doneAt: string | null; firstName: string | null; lastName: string | null }

export default function ReviewsPage() {
  const [status, setStatus] = useState<'pending' | 'done'>('pending');
  const { data, error, loading } = useLoad(() => api.get<Review[]>(`/reviews?status=${status}`), [status]);
  return (
    <>
      <PageHeader title="Corrections humaines" subtitle="Productions des abonnés Premium Pro et Pack Réussite, à noter sur 20 avec un commentaire." />
      <div className="mb-4 flex gap-1">
        {(['pending', 'done'] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={cx('rounded-lg px-4 py-2 text-sm font-semibold', status === s ? 'bg-navy-900 text-white' : 'border border-line bg-white')}>{s === 'pending' ? 'À corriger' : 'Corrigées'}</button>
        ))}
      </div>
      <ErrorNotice error={error} />
      {loading ? <Spinner /> : (data ?? []).length === 0 ? <Empty title={status === 'pending' ? 'Aucune copie en attente' : 'Aucune copie corrigée'} /> : (
        <div className="overflow-hidden rounded-xl border border-line bg-white">
          {data!.map((r) => (
            <Link key={r.id} href={`/admin/corrections/${r.id}`} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-navy-50">
              <div className="flex items-center gap-3">
                {r.kind === 'writing' ? <PenLine className="h-4 w-4 text-gold-500" /> : <Mic className="h-4 w-4 text-ok-600" />}
                <div>
                  <p className="font-medium">{[r.firstName, r.lastName].filter(Boolean).join(' ') || 'Candidat'}</p>
                  <p className="text-xs text-muted">{r.kind === 'writing' ? 'Expression écrite' : 'Expression orale'} · reçue {dateTime(r.createdAt)}</p>
                </div>
              </div>
              {r.score !== null ? <Badge tone="ok">{r.score}/20</Badge> : <Badge tone="warn">À corriger</Badge>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
