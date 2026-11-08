'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Lightbulb } from 'lucide-react';
import { EE_TASKS, EO_TASKS, LEVELS, SKILLS, type Skill } from '@c2pass/shared';
import { Choices, RecorderPanel, WritingEditor } from '@/components/exercise';
import { FeedbackPanel } from '@/components/feedback';
import { ListenButton, useAudioPlayback } from '@/components/listen-button';
import { Badge, Button, Card, cx, ErrorNotice, Notice, PageHeader, Spinner } from '@/components/ui';
import { api, fetchRaw } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAction } from '@/lib/hooks';
import { SKILL_META } from '@/lib/format';
import { extensionFor, sendWithRetry } from '@/lib/recorder';
import type { AnswerResult, PublicQuestion, SpeakingResult, WritingResult } from '@/lib/types';

function Practice() {
  const params = useParams<{ skill: string }>();
  const skill = (SKILLS as readonly string[]).includes(params.skill) ? (params.skill as Skill) : null;
  const search = useSearchParams();
  const router = useRouter();
  const level = search.get('niveau') ?? '';
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const loader = useAction();

  const next = useCallback(async () => {
    if (!skill) return;
    const q = await loader.run(() => api.get<PublicQuestion>(`/training/${skill}/question${level ? `?level=${level}` : ''}`));
    setQuestion(q ?? null);
  }, [skill, level, loader]);

  useEffect(() => {
    void next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skill, level]);

  if (!skill) return <Notice tone="error">Compétence inconnue.</Notice>;

  return (
    <>
      <Link href="/entrainement" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-navy-900"><ArrowLeft className="h-4 w-4" />Entraînement</Link>
      <PageHeader
        title={SKILL_META[skill].label}
        subtitle="Mode entraînement : correction immédiate et explications."
        actions={
          <div className="flex flex-wrap gap-1">
            {['', ...LEVELS].map((l) => (
              <button key={l} onClick={() => router.replace(`/entrainement/${skill}${l ? `?niveau=${l}` : ''}`)}
                className={cx('rounded-md px-2.5 py-1 text-xs font-semibold', level === l ? 'bg-navy-900 text-white' : 'border border-line bg-white text-navy-800')}>
                {l || 'Tous'}
              </button>
            ))}
          </div>
        }
      />
      {loader.busy && <Spinner />}
      {!loader.busy && loader.error && <ErrorNotice error={loader.error} />}
      {!loader.busy && question && (
        <>
          {(skill === 'CO' || skill === 'CE') && <McqExercise key={question.id} question={question} onNext={next} />}
          {skill === 'EE' && <WritingExercise key={question.id} question={question} onNext={next} />}
          {skill === 'EO' && <SpeakingExercise key={question.id} question={question} onNext={next} />}
        </>
      )}
    </>
  );
}

function QuestionHeader({ q }: { q: PublicQuestion }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Badge>{q.level}</Badge>
      <Badge tone="gray">{q.theme}</Badge>
      {q.task && <Badge tone="gold">Tâche {q.task}</Badge>}
    </div>
  );
}

function McqExercise({ question: q, onNext }: { question: PublicQuestion; onNext: () => void }) {
  const [choice, setChoice] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);
  const [audioError, setAudioError] = useState<unknown>(null);
  const audio = useAudioPlayback();
  const action = useAction();

  async function listen() {
    setLoadingAudio(true);
    setAudioError(null);
    try {
      const res = await fetchRaw(`/training/audio/${encodeURIComponent(q.id)}`);
      if (res.headers.get('content-type')?.includes('application/json')) audio.play({ tts: ((await res.json()) as { tts: string }).tts });
      else audio.play({ blob: await res.blob() });
    } catch (e) {
      setAudioError(e);
    } finally {
      setLoadingAudio(false);
    }
  }

  async function validate() {
    if (choice === null) return;
    const r = await action.run(() => api.post<AnswerResult>('/training/answer', { questionId: q.id, choice }));
    if (r) setResult(r);
  }

  return (
    <Card>
      <QuestionHeader q={q} />
      {q.skill === 'CO' && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <ListenButton onClick={() => void listen()} playing={audio.playing} loading={loadingAudio} label={q.hasRecording ? 'Écouter l’enregistrement' : 'Écouter (voix de synthèse)'} />
          <span className="text-xs text-muted">Réécoute autorisée en entraînement. À l’examen, une seule écoute.</span>
        </div>
      )}
      <ErrorNotice error={audioError} />
      {q.context && <div className="mb-4 whitespace-pre-line rounded-lg border-l-4 border-navy-700 bg-navy-50 p-4 text-[15px] leading-relaxed">{q.context}</div>}
      <p className="mb-3 font-semibold text-navy-900">{q.statement}</p>
      <Choices options={q.options} selected={choice} onSelect={(i) => !result && setChoice(i)} correctAnswer={result?.correctAnswer} disabled={!!result} />
      <div className="mt-4"><ErrorNotice error={action.error} /></div>
      {result && (
        <div className="mt-4 space-y-3">
          <Notice tone={result.correct ? 'ok' : 'error'} title={result.correct ? 'Bonne réponse !' : 'Ce n’est pas la bonne réponse.'}>
            {result.whyWrong && <p>{result.whyWrong}</p>}
          </Notice>
          {result.explanation && <div className="flex gap-2 rounded-lg bg-gold-50 p-3 text-sm"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" />{result.explanation}</div>}
          {result.transcript && (
            <details className="rounded-lg border border-line p-3 text-sm">
              <summary className="cursor-pointer font-medium">Transcription du document</summary>
              <p className="mt-2 whitespace-pre-line text-muted">{result.transcript}</p>
            </details>
          )}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        {!result ? <Button onClick={() => void validate()} disabled={choice === null} busy={action.busy}>Valider</Button> : <Button onClick={onNext}>Question suivante <ArrowRight className="h-4 w-4" /></Button>}
      </div>
    </Card>
  );
}

function usePolling<T extends { status: string }>(initial: T | null, path: (r: T) => string) {
  const [value, setValue] = useState<T | null>(initial);
  useEffect(() => setValue(initial), [initial]);
  useEffect(() => {
    if (!value || value.status !== 'pending') return;
    const t = setTimeout(async () => setValue(await api.get<T>(path(value)).catch(() => value)), 2500);
    return () => clearTimeout(t);
  }, [value, path]);
  return value;
}

function WritingExercise({ question: q, onNext }: { question: PublicQuestion; onNext: () => void }) {
  const { me } = useAuth();
  const bounds = EE_TASKS[(q.task ?? 3) - 1];
  const [text, setText] = useState('');
  const [human, setHuman] = useState(false);
  const [submitted, setSubmitted] = useState<WritingResult | null>(null);
  const result = usePolling(submitted, useCallback((r: WritingResult) => `/training/submissions/${r.id}`, []));
  const action = useAction();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <QuestionHeader q={q} />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{bounds.title}</p>
        <p className="mt-2 whitespace-pre-line font-semibold text-navy-900">{q.statement}</p>
        {q.context && <div className="mt-3 whitespace-pre-line rounded-lg bg-navy-50 p-3 text-sm leading-relaxed">{q.context}</div>}
      </Card>
      <div className="space-y-4">
        <Card>
          <WritingEditor value={text} onChange={setText} bounds={bounds} disabled={!!result} />
          {!result && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <label className={cx('flex items-center gap-2 text-sm', !me?.plan.humanCorrection && 'opacity-60')}>
                <input type="checkbox" checked={human} disabled={!me?.plan.humanCorrection} onChange={(e) => setHuman(e.target.checked)} />
                Demander aussi un correcteur humain {!me?.plan.humanCorrection && <Badge tone="gold">Pro</Badge>}
              </label>
              <Button busy={action.busy} disabled={text.trim().length < 20} onClick={async () => {
                const r = await action.run(() => api.post<WritingResult>('/training/writing', { questionId: q.id, text, humanReview: human }));
                if (r) setSubmitted(r);
              }}>Corriger mon texte</Button>
            </div>
          )}
          <div className="mt-3"><ErrorNotice error={action.error} /></div>
        </Card>
        {result && (
          <>
            {result.metrics && (
              <Card className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Metric label="Mots" value={result.wordCount} />
                <Metric label="Diversité lexicale" value={result.metrics.lexicalDiversity !== undefined ? `${Math.round(result.metrics.lexicalDiversity * 100)} %` : '—'} />
                <Metric label="Connecteurs C1–C2" value={result.metrics.advancedConnectors?.length ?? 0} />
                <Metric label="Structures complexes" value={result.metrics.complexStructures ?? 0} />
              </Card>
            )}
            <FeedbackPanel feedback={result.feedback} humanReview={result.humanReview} status={result.status} />
            {result.metrics?.advancedConnectors && result.metrics.advancedConnectors.length > 0 && (
              <p className="text-sm text-muted">Connecteurs repérés : {result.metrics.advancedConnectors.join(', ')}</p>
            )}
            <div className="flex justify-end"><Button onClick={onNext}>Nouveau sujet <ArrowRight className="h-4 w-4" /></Button></div>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><p className="text-xs text-muted">{label}</p><p className="text-lg font-bold text-navy-900">{value}</p></div>;
}

function SpeakingExercise({ question: q, onNext }: { question: PublicQuestion; onNext: () => void }) {
  const { me } = useAuth();
  const task = EO_TASKS[(q.task ?? 1) - 1];
  const [human, setHuman] = useState(false);
  const [submitted, setSubmitted] = useState<SpeakingResult | null>(null);
  const result = usePolling(submitted, useCallback((r: SpeakingResult) => `/training/recordings/${r.id}`, []));
  const action = useAction();

  async function send(blob: Blob, seconds: number) {
    const form = new FormData();
    form.append('audio', blob, `eo.${extensionFor(blob.type)}`);
    form.append('questionId', q.id);
    form.append('duration', String(seconds));
    form.append('humanReview', String(human));
    const r = await action.run(() => sendWithRetry(() => api.post<SpeakingResult>('/training/speaking', form)));
    if (r) setSubmitted(r);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <QuestionHeader q={q} />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{task.title} · {Math.round(task.seconds / 60 * 10) / 10} min{task.prepSeconds ? ` · ${task.prepSeconds / 60} min de préparation` : ''}</p>
        <p className="mt-2 whitespace-pre-line font-semibold text-navy-900">{q.statement}</p>
        {q.context && <p className="mt-3 whitespace-pre-line text-sm text-muted">{q.context}</p>}
      </Card>
      <div className="space-y-4">
        {!result && (
          <>
            <RecorderPanel maxSeconds={task.seconds} onRecorded={(b, s) => void send(b, s)} disabled={action.busy} />
            <label className={cx('flex items-center gap-2 text-sm', !me?.plan.humanCorrection && 'opacity-60')}>
              <input type="checkbox" checked={human} disabled={!me?.plan.humanCorrection} onChange={(e) => setHuman(e.target.checked)} />
              Faire corriger par un correcteur humain {!me?.plan.humanCorrection && <Badge tone="gold">Pro</Badge>}
            </label>
            {action.busy && <Spinner label="Envoi et transcription…" />}
            <ErrorNotice error={action.error} />
          </>
        )}
        {result && (
          <>
            {result.transcription && (
              <Card><p className="text-xs font-semibold uppercase tracking-wide text-muted">Transcription</p><p className="mt-2 text-sm leading-relaxed">{result.transcription}</p></Card>
            )}
            <FeedbackPanel feedback={result.feedback} humanReview={result.humanReview} status={result.status} />
            <div className="flex justify-end"><Button onClick={onNext}>Nouveau sujet <ArrowRight className="h-4 w-4" /></Button></div>
          </>
        )}
      </div>
    </div>
  );
}

export default function PracticePage() {
  return <Suspense><Practice /></Suspense>;
}
