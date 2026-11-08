'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Headphones, Lock, Maximize, Mic, Square } from 'lucide-react';
import { EE_TASKS, EO_TASKS, type Skill } from '@c2pass/shared';
import { Logo } from '@/components/logo';
import { Choices, MicProblemNotice, WritingEditor } from '@/components/exercise';
import { ListenButton, useAudioPlayback } from '@/components/listen-button';
import { RequireAuth } from '@/components/require-auth';
import { Badge, Button, Card, cx, ErrorNotice, Notice, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { fingerprint } from '@/lib/fingerprint';
import { clock, SKILL_META } from '@/lib/format';
import { useAction } from '@/lib/hooks';
import { canRecord, extensionFor, MIC_MESSAGES, problemOf, sendWithRetry, useRecorder, type MicProblem } from '@/lib/recorder';
import type { ExamQuestion, ExamState } from '@/lib/types';

type Current = NonNullable<ExamState['current']>;
type FraudEvent = 'blur' | 'copy' | 'paste' | 'contextmenu' | 'fullscreen_exit';

export default function ExamPage() {
  return (
    <RequireAuth>
      <ExamRunner />
    </RequireAuth>
  );
}

function ExamRunner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<ExamState | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(true);

  const load = useCallback(async () => {
    try {
      const s = await api.get<ExamState>(`/simulator/sessions/${id}`);
      setState(s);
      if (s.status !== 'created' && s.status !== 'in_progress') router.replace(`/resultats/${id}`);
    } catch (e) {
      setError(e);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const running = state?.status === 'in_progress';

  const report = useCallback((type: FraudEvent, message?: string) => {
    void fingerprint().then((fp) => api.post(`/simulator/sessions/${id}/events`, { type, fingerprint: fp }).catch(() => undefined));
    if (message) setWarning(message);
  }, [id]);

  // Integrity monitoring while a section is running (cahier des charges §1.C).
  useEffect(() => {
    if (!running) return;
    const onVisibility = () => document.visibilityState === 'hidden' && report('blur', 'Vous avez quitté la page de l’examen. Cet événement est enregistré.');
    const block = (type: FraudEvent, message: string) => (e: Event) => {
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA' && type === 'contextmenu') return;
      e.preventDefault();
      report(type, message);
    };
    const onCopy = block('copy', 'La copie est désactivée pendant l’examen.');
    const onPaste = block('paste', 'Le collage est désactivé pendant l’examen.');
    const onMenu = block('contextmenu', 'Le menu contextuel est désactivé pendant l’examen.');
    const onFs = () => {
      const fs = !!document.fullscreenElement;
      setFullscreen(fs);
      if (!fs) report('fullscreen_exit');
    };
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('contextmenu', onMenu);
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('beforeunload', onUnload);
    setFullscreen(!!document.fullscreenElement || !document.fullscreenEnabled);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('contextmenu', onMenu);
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [running, report]);

  useEffect(() => {
    if (!warning) return;
    const t = setTimeout(() => setWarning(null), 5000);
    return () => clearTimeout(t);
  }, [warning]);

  if (error) {
    return <div className="mx-auto max-w-xl p-8"><ErrorNotice error={error} /></div>;
  }
  if (!state) return <Spinner />;

  if (state.status === 'created') return <Intro state={state} onStarted={setState} />;
  if (!state.current) return <Spinner label="Fin de la simulation…" />;

  return (
    <div className="exam-lock min-h-dvh bg-[#f3f5f9]">
      <ExamHeader state={state} current={state.current} onAdvance={setState} onExpired={load} />
      {!fullscreen && (
        <div className="bg-warn-50 px-4 py-2 text-center text-sm text-warn-600">
          Vous êtes sorti du plein écran (événement enregistré).{' '}
          <button className="font-semibold underline" onClick={() => void document.documentElement.requestFullscreen?.().catch(() => undefined)}>Revenir en plein écran</button>
        </div>
      )}
      {warning && <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-navy-900 px-4 py-2 text-sm text-white shadow-lg">{warning}</div>}
      <main className="mx-auto max-w-4xl px-4 py-6">
        {(state.current.skill === 'CO' || state.current.skill === 'CE') && <McqSection key={state.current.skill} sessionId={state.id} current={state.current} />}
        {state.current.skill === 'EE' && <WritingSection key="EE" sessionId={state.id} current={state.current} onBlocked={(t) => report(t, t === 'paste' ? 'Le collage est désactivé pendant l’examen.' : 'La copie est désactivée pendant l’examen.')} />}
        {state.current.skill === 'EO' && <SpeakingSection key="EO" sessionId={state.id} current={state.current} />}
      </main>
    </div>
  );
}

function Intro({ state, onStarted }: { state: ExamState; onStarted: (s: ExamState) => void }) {
  const router = useRouter();
  const action = useAction();
  const [mic, setMic] = useState<'unknown' | 'ok' | MicProblem>('unknown');
  const needsMic = state.sections.some((s) => s.skill === 'EO');

  async function testMic() {
    try {
      if (!canRecord()) throw new Error('unsupported');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMic('ok');
    } catch (e) {
      setMic(problemOf(e));
    }
  }

  async function start() {
    await document.documentElement.requestFullscreen?.().catch(() => undefined);
    const s = await action.run(async () => api.post<ExamState>(`/simulator/sessions/${state.id}/start`, { fingerprint: await fingerprint() }));
    if (s) onStarted(s);
  }

  return (
    <div className="min-h-dvh bg-navy-900 px-4 py-10 text-white">
      <div className="mx-auto max-w-2xl">
        <Logo light />
        <h1 className="h-serif mt-8 text-3xl font-bold">{state.type === 'full' ? 'Simulation complète du TCF Canada' : `Épreuve : ${SKILL_META[state.sections[0].skill].label}`}</h1>
        <div className="mt-6 space-y-2">
          {state.sections.map((s, i) => (
            <div key={s.skill} className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-3">
              <span><b className="mr-2 text-gold-500">{i + 1}.</b>{SKILL_META[s.skill].label}</span>
              <span className="text-sm text-navy-100/70">{s.items} {s.skill === 'CO' || s.skill === 'CE' ? 'questions' : 'tâches'} · {s.minutes} min</span>
            </div>
          ))}
        </div>
        <Card className="mt-6 text-ink">
          <p className="font-semibold text-navy-900">Règles de l’épreuve</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            <li className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-maple-600" />Le chronomètre démarre dès que vous cliquez sur « Commencer » et ne peut pas être mis en pause.</li>
            <li className="flex gap-2"><Headphones className="mt-0.5 h-4 w-4 shrink-0 text-maple-600" />Chaque document sonore est diffusé une seule fois.</li>
            <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-maple-600" />Pas de retour en arrière : une réponse validée et une section terminée sont définitives.</li>
            <li className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-maple-600" />Copier-coller désactivé. Les sorties de page et de plein écran sont enregistrées.</li>
          </ul>
          {needsMic && (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-navy-50 p-3 text-sm">
              <Mic className="h-4 w-4" /> Micro :
              {mic === 'ok' ? <Badge tone="ok">Fonctionne</Badge> : mic === 'unknown' ? <Button size="sm" variant="secondary" onClick={() => void testMic()}>Tester le micro</Button> : <Badge tone="maple">Indisponible</Badge>}
              {mic !== 'ok' && mic !== 'unknown' && (
                <p className="w-full text-muted">{MIC_MESSAGES[mic]} À défaut, vous pourrez envoyer un enregistrement fait avec votre téléphone.</p>
              )}
            </div>
          )}
          <div className="mt-4"><ErrorNotice error={action.error} /></div>
          <div className="mt-5 flex flex-wrap justify-between gap-3">
            <Button variant="ghost" onClick={() => router.push('/simulateur')}>Plus tard</Button>
            <Button size="lg" onClick={() => void start()} busy={action.busy}><Maximize className="h-4 w-4" />Commencer en plein écran</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function useCountdown(current: Current) {
  const deadline = useMemo(() => Date.now() + current.remainingSeconds * 1000, [current.remainingSeconds, current.index]); // eslint-disable-line react-hooks/exhaustive-deps
  const [left, setLeft] = useState(current.remainingSeconds);
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000))), 500);
    return () => clearInterval(t);
  }, [deadline]);
  return left;
}

function ExamHeader({ state, current, onAdvance, onExpired }: { state: ExamState; current: Current; onAdvance: (s: ExamState) => void; onExpired: () => void }) {
  const router = useRouter();
  const left = useCountdown(current);
  const action = useAction();
  const [confirm, setConfirm] = useState<'next' | 'abandon' | null>(null);
  const expiredOnce = useRef(false);

  useEffect(() => {
    expiredOnce.current = false;
  }, [current.index]);

  // Time lock: when the clock hits zero, pending work is flushed by the sections, then the server closes the section.
  useEffect(() => {
    if (left > 0 || expiredOnce.current) return;
    expiredOnce.current = true;
    window.dispatchEvent(new Event('c2pass:time-up'));
    const t = setTimeout(async () => {
      const s = await api.post<ExamState>(`/simulator/sessions/${state.id}/next`, { index: current.index }).catch(() => null);
      if (s) {
        onAdvance(s);
        if (s.status !== 'in_progress') router.replace(`/resultats/${state.id}`);
      } else onExpired();
    }, 1500);
    return () => clearTimeout(t);
  }, [left, current.index, state.id, onAdvance, onExpired, router]);

  async function next() {
    window.dispatchEvent(new Event('c2pass:time-up'));
    await new Promise((r) => setTimeout(r, 800));
    const s = await action.run(() => api.post<ExamState>(`/simulator/sessions/${state.id}/next`, { index: current.index }));
    setConfirm(null);
    if (s) {
      onAdvance(s);
      if (s.status !== 'in_progress') {
        await document.exitFullscreen?.().catch(() => undefined);
        router.replace(`/resultats/${state.id}`);
      }
    }
  }

  async function abandon() {
    await action.run(() => api.post(`/simulator/sessions/${state.id}/abandon`));
    await document.exitFullscreen?.().catch(() => undefined);
    router.replace('/simulateur');
  }

  const last = current.index === state.sections.length - 1;
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <Badge tone="navy" className="text-sm">Section {current.index + 1}/{state.sections.length}</Badge>
          <span className="font-semibold text-navy-900">{SKILL_META[current.skill].label}</span>
        </div>
        <div className={cx('flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-xl font-bold', left <= 60 ? 'animate-pulse bg-maple-50 text-maple-700' : left <= 300 ? 'bg-warn-50 text-warn-600' : 'bg-navy-50 text-navy-900')} aria-live="polite">
          <Clock className="h-5 w-5" />{clock(left)}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setConfirm('abandon')}>Abandonner</Button>
          <Button size="sm" variant="navy" onClick={() => setConfirm('next')}>{last ? 'Terminer l’examen' : 'Terminer la section'}</Button>
        </div>
      </div>
      <div className="mx-auto flex max-w-5xl gap-1 px-4 pb-2">
        {state.sections.map((s) => (
          <div key={s.skill} className={cx('h-1.5 flex-1 rounded-full', s.state === 'done' ? 'bg-ok-600' : s.state === 'current' ? 'bg-maple-600' : 'bg-slate-200')} title={s.skill} />
        ))}
      </div>
      {confirm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-navy-950/60 px-4">
          <Card className="max-w-md">
            <p className="font-semibold text-navy-900">{confirm === 'next' ? (last ? 'Terminer l’examen ?' : 'Terminer cette section ?') : 'Abandonner la simulation ?'}</p>
            <p className="mt-2 text-sm text-muted">
              {confirm === 'next' ? `Il vous reste ${clock(left)}. Vous ne pourrez plus revenir sur cette section.` : 'La simulation sera arrêtée et ne sera pas notée. Elle reste décomptée de votre quota mensuel.'}
            </p>
            <div className="mt-3"><ErrorNotice error={action.error} /></div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirm(null)}>Continuer l’épreuve</Button>
              {confirm === 'next' ? <Button onClick={() => void next()} busy={action.busy}>Confirmer</Button> : <Button variant="danger" onClick={() => void abandon()} busy={action.busy}>Abandonner</Button>}
            </div>
          </Card>
        </div>
      )}
    </header>
  );
}

function McqSection({ sessionId, current }: { sessionId: string; current: Current }) {
  const questions = current.questions;
  const [answers, setAnswers] = useState<Record<string, number>>(() => Object.fromEntries(questions.filter((q) => q.answered !== null).map((q) => [q.id, q.answered!])));
  const [played, setPlayed] = useState<Record<string, boolean>>(() => Object.fromEntries(questions.map((q) => [q.id, q.played])));
  const lastAnswered = questions.reduce((acc, q, i) => (q.answered !== null ? i : acc), -1);
  const [pos, setPos] = useState(Math.min(lastAnswered + 1, questions.length - 1));
  const [choice, setChoice] = useState<number | null>(null);
  const [heard, setHeard] = useState(false);
  const action = useAction();
  const audio = useAudioPlayback();
  const q = questions[pos];
  const done = Object.keys(answers).length;

  useEffect(() => {
    setChoice(null);
    setHeard(false);
  }, [pos]);

  async function listen() {
    const src = await action.run(() => api.post<{ url?: string; tts?: string }>(`/simulator/sessions/${sessionId}/play/${encodeURIComponent(q.id)}`));
    if (!src) return;
    setPlayed((p) => ({ ...p, [q.id]: true }));
    audio.play(src.url ? { url: src.url } : { tts: src.tts ?? '' }, () => setHeard(true));
  }

  async function validate() {
    if (choice === null) return;
    const ok = await action.run(() => api.post(`/simulator/sessions/${sessionId}/answers`, { questionId: q.id, choice })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.code === 'already_answered') return { saved: true };
        throw e;
      }));
    if (ok) {
      setAnswers((a) => ({ ...a, [q.id]: choice }));
      if (pos < questions.length - 1) setPos(pos + 1);
    }
  }

  const answered = answers[q.id] !== undefined;
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-1">
        {questions.map((x, i) => (
          <span key={x.id} className={cx('grid h-7 w-7 place-items-center rounded text-xs font-semibold',
            i === pos ? 'bg-navy-900 text-white' : answers[x.id] !== undefined ? 'bg-ok-50 text-ok-600' : i < pos ? 'bg-slate-200 text-slate-500' : 'bg-white text-slate-400')}>{i + 1}</span>
        ))}
      </div>
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-muted">Question {pos + 1} sur {questions.length}</p>
          <p className="text-sm text-muted">{done} réponse(s) enregistrée(s)</p>
        </div>
        {q.skill === 'CO' && (
          <div className="mb-4 rounded-lg bg-navy-50 p-4">
            {!played[q.id] ? (
              <div className="flex flex-wrap items-center gap-3">
                <ListenButton onClick={() => void listen()} playing={audio.playing} loading={action.busy} />
                <span className="text-sm text-muted">Lisez la question et les réponses avant d’écouter : une seule diffusion.</span>
              </div>
            ) : audio.playing ? (
              <p className="flex items-center gap-2 font-semibold text-navy-900"><Headphones className="h-5 w-5 animate-pulse text-maple-600" />Écoute en cours… concentrez-vous.</p>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted"><CheckCircle2 className="h-4 w-4 text-ok-600" />{heard ? 'Document diffusé.' : 'Ce document a déjà été diffusé.'} Choisissez votre réponse.</p>
            )}
          </div>
        )}
        {q.context && <div className="mb-4 max-h-[50vh] overflow-y-auto whitespace-pre-line rounded-lg border-l-4 border-navy-700 bg-navy-50 p-4 text-[15px] leading-relaxed">{q.context}</div>}
        <p className="mb-3 font-semibold text-navy-900">{q.statement}</p>
        <Choices options={q.options} selected={answered ? answers[q.id] : choice} onSelect={setChoice} disabled={answered} />
        <div className="mt-3"><ErrorNotice error={action.error} /></div>
        <div className="mt-5 flex items-center justify-between">
          <p className="text-xs text-muted"><Lock className="mr-1 inline h-3 w-3" />Réponse définitive après validation.</p>
          <div className="flex gap-2">
            {pos < questions.length - 1 && <Button variant="ghost" onClick={() => setPos(pos + 1)} disabled={audio.playing}>{answered ? 'Suivante' : 'Passer'}</Button>}
            {!answered && <Button onClick={() => void validate()} disabled={choice === null} busy={action.busy}>Valider</Button>}
          </div>
        </div>
        {pos === questions.length - 1 && answered && <div className="mt-4"><Notice tone="ok">Dernière question traitée. Vous pouvez terminer la section avec le bouton en haut de l’écran.</Notice></div>}
      </Card>
    </>
  );
}

function WritingSection({ sessionId, current, onBlocked }: { sessionId: string; current: Current; onBlocked: (t: 'copy' | 'paste') => void }) {
  const [tab, setTab] = useState(0);
  const [texts, setTexts] = useState<Record<string, string>>(() => Object.fromEntries(current.questions.map((q) => [q.id, q.draft ?? ''])));
  const [saved, setSaved] = useState<Record<string, string>>(texts);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const textsRef = useRef(texts);
  textsRef.current = texts;

  const flush = useCallback(async () => {
    const dirty = Object.entries(textsRef.current).filter(([id, t]) => t !== saved[id]);
    if (!dirty.length) return;
    setStatus('saving');
    try {
      for (const [id, text] of dirty) await api.put(`/simulator/sessions/${sessionId}/writing/${encodeURIComponent(id)}`, { text });
      setSaved((s) => ({ ...s, ...Object.fromEntries(dirty) }));
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }, [saved, sessionId]);

  useEffect(() => {
    const t = setTimeout(() => void flush(), 4000);
    return () => clearTimeout(t);
  }, [texts, flush]);

  useEffect(() => {
    const onTimeUp = () => void flush();
    window.addEventListener('c2pass:time-up', onTimeUp);
    return () => window.removeEventListener('c2pass:time-up', onTimeUp);
  }, [flush]);

  const q = current.questions[tab];
  const bounds = EE_TASKS[(q.task ?? tab + 1) - 1];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {current.questions.map((x, i) => (
            <button key={x.id} onClick={() => { void flush(); setTab(i); }} className={cx('rounded-lg px-4 py-2 text-sm font-semibold', i === tab ? 'bg-navy-900 text-white' : 'border border-line bg-white text-navy-800')}>
              Tâche {x.task ?? i + 1}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">{status === 'saving' ? 'Enregistrement…' : status === 'error' ? '⚠ Échec de l’enregistrement, nouvel essai automatique' : 'Brouillon enregistré'}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{bounds.title}</p>
          <p className="mt-2 whitespace-pre-line font-semibold text-navy-900">{q.statement}</p>
          {q.context && <div className="mt-3 whitespace-pre-line rounded-lg bg-navy-50 p-3 text-sm leading-relaxed">{q.context}</div>}
        </Card>
        <Card>
          <WritingEditor value={texts[q.id]} onChange={(v) => setTexts((t) => ({ ...t, [q.id]: v }))} bounds={bounds} blockPaste onBlocked={onBlocked} rows={16} />
        </Card>
      </div>
    </>
  );
}

function SpeakingSection({ sessionId, current }: { sessionId: string; current: Current }) {
  const [recorded, setRecorded] = useState<Record<string, boolean>>(() => Object.fromEntries(current.questions.map((q) => [q.id, q.recorded])));
  const firstTodo = current.questions.findIndex((q) => !q.recorded);
  const [pos, setPos] = useState(firstTodo === -1 ? current.questions.length - 1 : firstTodo);
  const q = current.questions[pos];
  const allDone = current.questions.every((x) => recorded[x.id]);

  return (
    <>
      <div className="mb-4 flex gap-2">
        {current.questions.map((x, i) => (
          <span key={x.id} className={cx('rounded-lg px-4 py-2 text-sm font-semibold', i === pos ? 'bg-navy-900 text-white' : recorded[x.id] ? 'bg-ok-50 text-ok-600' : 'border border-line bg-white text-slate-400')}>
            Tâche {x.task ?? i + 1} {recorded[x.id] && '✓'}
          </span>
        ))}
      </div>
      {allDone ? (
        <Notice tone="ok" title="Toutes les tâches sont enregistrées.">Terminez l’examen avec le bouton en haut de l’écran pour lancer la correction.</Notice>
      ) : (
        <SpeakingTask
          key={q.id}
          sessionId={sessionId}
          question={q}
          onDone={() => {
            setRecorded((r) => ({ ...r, [q.id]: true }));
            if (pos < current.questions.length - 1) setPos(pos + 1);
          }}
        />
      )}
    </>
  );
}

function SpeakingTask({ sessionId, question: q, onDone }: { sessionId: string; question: ExamQuestion; onDone: () => void }) {
  const task = EO_TASKS[(q.task ?? 1) - 1];
  const [phase, setPhase] = useState<'ready' | 'prep' | 'recording' | 'uploading'>('ready');
  const [prepLeft, setPrepLeft] = useState<number>(task.prepSeconds);
  const rec = useRecorder(task.seconds);
  const action = useAction();
  const uploaded = useRef(false);

  useEffect(() => {
    if (phase !== 'prep') return;
    if (prepLeft <= 0) {
      setPhase('recording');
      void rec.start();
      return;
    }
    const t = setTimeout(() => setPrepLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, prepLeft, rec]);

  const upload = useCallback(async (blob: Blob, seconds: number) => {
    const form = new FormData();
    form.append('audio', blob, `eo-${q.id}.${extensionFor(blob.type)}`);
    form.append('questionId', q.id);
    form.append('duration', String(seconds));
    const ok = await action.run(() => sendWithRetry(() => api.post(`/simulator/sessions/${sessionId}/audio`, form)));
    if (ok) onDone();
  }, [q.id, sessionId, action, onDone]);

  // Upload automatically as soon as the recording stops (no second take, as in the exam).
  useEffect(() => {
    if (rec.state !== 'done' || !rec.blob || uploaded.current) return;
    uploaded.current = true;
    setPhase('uploading');
    void upload(rec.blob, rec.elapsed);
  }, [rec.state, rec.blob, rec.elapsed, upload]);

  useEffect(() => {
    const onTimeUp = () => rec.stop();
    window.addEventListener('c2pass:time-up', onTimeUp);
    return () => window.removeEventListener('c2pass:time-up', onTimeUp);
  }, [rec]);

  return (
    <Card>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{task.title} · {clock(task.seconds)} d’enregistrement{task.prepSeconds ? ` · ${clock(task.prepSeconds)} de préparation` : ''}</p>
      <p className="mt-2 whitespace-pre-line text-lg font-semibold text-navy-900">{q.statement}</p>
      {q.context && <p className="mt-2 whitespace-pre-line text-sm text-muted">{q.context}</p>}
      <div className="mt-6 rounded-xl bg-navy-50 p-5">
        {rec.state === 'denied' && rec.problem && <MicProblemNotice problem={rec.problem} maxSeconds={task.seconds} onRetry={() => { setPhase('recording'); void rec.start(); }} onFile={(f) => void rec.takeFile(f)} />}
        {phase === 'ready' && (
          <Button size="lg" onClick={() => { if (task.prepSeconds) setPhase('prep'); else { setPhase('recording'); void rec.start(); } }}>
            <Mic className="h-5 w-5" />{task.prepSeconds ? 'Commencer la préparation' : 'Commencer à parler'}
          </Button>
        )}
        {phase === 'prep' && (
          <div className="flex items-center gap-4">
            <span className="font-mono text-3xl font-bold text-navy-900">{clock(prepLeft)}</span>
            <span className="text-sm text-muted">Préparation : l’enregistrement démarre automatiquement.</span>
            <Button variant="secondary" size="sm" onClick={() => setPrepLeft(0)}>Je suis prêt</Button>
          </div>
        )}
        {phase === 'recording' && rec.state === 'recording' && (
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-2 font-mono text-3xl font-bold text-maple-700"><span className="h-3 w-3 animate-pulse rounded-full bg-maple-600" />{clock(task.seconds - rec.elapsed)}</span>
            <span className="text-sm text-muted">Enregistrement en cours…</span>
            <Button variant="navy" onClick={rec.stop}><Square className="h-4 w-4" />J’ai terminé</Button>
          </div>
        )}
        {phase === 'uploading' && action.busy && <Spinner label="Envoi de l’enregistrement…" />}
        <ErrorNotice error={action.error} />
        {phase === 'uploading' && !action.busy && action.error && rec.blob && (
          <Button className="mt-3" variant="secondary" onClick={() => void upload(rec.blob!, rec.elapsed)}>Renvoyer l’enregistrement</Button>
        )}
      </div>
    </Card>
  );
}
