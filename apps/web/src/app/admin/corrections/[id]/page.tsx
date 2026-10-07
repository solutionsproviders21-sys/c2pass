'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { FeedbackPanel } from '@/components/feedback';
import { Button, Card, ErrorNotice, Field, Input, LinkButton, Spinner, Textarea } from '@/components/ui';
import { api, fetchRaw } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import type { Feedback } from '@/lib/types';

interface Detail {
  id: string; submissionId: string; kind: 'writing' | 'speaking'; status: string; score: number | null; comment: string | null;
  question: { statement: string; context: string | null; task: number; level: string } | null;
  submission: { text: string | null; transcription: string | null; audioUrl: string | null; aiScore: number | null; feedback: Feedback | null; wordCount: number | null } | null;
}

export default function ReviewDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading } = useLoad(() => api.get<Detail>(`/reviews/${id}`), [id]);
  const [score, setScore] = useState('');
  const [comment, setComment] = useState('');
  const [audio, setAudio] = useState<string | null>(null);
  const action = useAction();

  useEffect(() => {
    if (!data) return;
    setScore(data.score !== null ? String(data.score) : data.submission?.aiScore != null ? String(data.submission.aiScore) : '');
    setComment(data.comment ?? '');
    if (data.kind === 'speaking') {
      let url: string | null = null;
      fetchRaw(`/reviews/${id}/audio`).then(async (r) => { url = URL.createObjectURL(await r.blob()); setAudio(url); }).catch(() => undefined);
      return () => { if (url) URL.revokeObjectURL(url); };
    }
  }, [data, id]);

  if (loading) return <Spinner />;
  if (error || !data) return <ErrorNotice error={error} />;

  return (
    <>
      <LinkButton href="/admin/corrections" variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" />Corrections</LinkButton>
      <h1 className="h-serif mt-2 text-2xl font-bold text-navy-900">{data.kind === 'writing' ? 'Expression écrite' : 'Expression orale'} · tâche {data.question?.task}</h1>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <p className="text-xs font-semibold uppercase text-muted">Sujet ({data.question?.level})</p>
            <p className="mt-1 whitespace-pre-line font-medium">{data.question?.statement}</p>
            {data.question?.context && <p className="mt-2 whitespace-pre-line text-sm text-muted">{data.question.context}</p>}
          </Card>
          <Card>
            <p className="text-xs font-semibold uppercase text-muted">Production du candidat</p>
            {data.submission?.text && <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{data.submission.text}</p>}
            {data.submission?.wordCount != null && <p className="mt-2 text-xs text-muted">{data.submission.wordCount} mots</p>}
            {data.kind === 'speaking' && (audio ? <audio controls src={audio} className="mt-2 w-full" /> : <Spinner label="Chargement de l’audio…" />)}
            {data.submission?.transcription && <p className="mt-3 rounded bg-navy-50 p-3 text-sm"><b>Transcription automatique : </b>{data.submission.transcription}</p>}
          </Card>
          {data.submission?.feedback && <FeedbackPanel feedback={data.submission.feedback} />}
        </div>
        <Card className="h-fit lg:sticky lg:top-6">
          <p className="font-semibold text-navy-900">Votre évaluation</p>
          <form className="mt-3 space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            const r = await action.run(() => api.post(`/reviews/${id}`, { score: Number(score), comment }));
            if (r) router.push('/admin/corrections');
          }}>
            <Field label="Note sur 20"><Input type="number" min={0} max={20} step={0.5} required value={score} onChange={(e) => setScore(e.target.value)} className="w-28" /></Field>
            <Field label="Commentaire pour le candidat" hint="Points forts, erreurs récurrentes, conseils concrets pour viser C2."><Textarea rows={10} required minLength={10} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
            <ErrorNotice error={action.error} />
            <Button type="submit" busy={action.busy}>{data.status === 'done' ? 'Mettre à jour la note' : 'Valider la correction'}</Button>
          </form>
        </Card>
      </div>
    </>
  );
}
