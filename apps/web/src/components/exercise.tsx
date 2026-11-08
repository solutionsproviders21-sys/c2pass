'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, Mic, Square, XCircle } from 'lucide-react';
import { words } from '@c2pass/shared';
import { clock } from '@/lib/format';
import { durationOf, MIC_MESSAGES, useRecorder, type MicProblem } from '@/lib/recorder';
import { Button, cx, Notice, Textarea } from './ui';

const LETTERS = ['A', 'B', 'C', 'D'];

export function Choices({ options, selected, onSelect, correctAnswer, disabled }: {
  options: string[]; selected: number | null; onSelect: (i: number) => void; correctAnswer?: number | null; disabled?: boolean;
}) {
  const revealed = correctAnswer !== undefined && correctAnswer !== null;
  return (
    <div className="space-y-2" role="radiogroup">
      {options.map((o, i) => {
        const isCorrect = revealed && i === correctAnswer;
        const isWrong = revealed && i === selected && i !== correctAnswer;
        return (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={selected === i}
            disabled={disabled}
            onClick={() => onSelect(i)}
            className={cx('flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition disabled:cursor-default',
              isCorrect ? 'border-ok-600 bg-ok-50' : isWrong ? 'border-maple-600 bg-maple-50' : selected === i ? 'border-navy-700 bg-navy-50 ring-1 ring-navy-700' : 'border-line bg-white hover:border-navy-700')}
          >
            <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold', selected === i ? 'bg-navy-900 text-white' : 'bg-slate-100 text-navy-800')}>{LETTERS[i]}</span>
            <span className="flex-1 pt-0.5">{o}</span>
            {isCorrect && <CheckCircle2 className="h-5 w-5 text-ok-600" />}
            {isWrong && <XCircle className="h-5 w-5 text-maple-600" />}
          </button>
        );
      })}
    </div>
  );
}

export function wordCountOf(text: string) {
  return words(text).length;
}

export function WritingEditor({ value, onChange, bounds, disabled, blockPaste, onBlocked, rows = 12 }: {
  value: string; onChange: (v: string) => void; bounds: { minWords: number; maxWords: number }; disabled?: boolean;
  blockPaste?: boolean; onBlocked?: (type: 'copy' | 'paste') => void; rows?: number;
}) {
  const n = wordCountOf(value);
  const tone = n === 0 ? 'text-muted' : n < bounds.minWords ? 'text-warn-600' : n > bounds.maxWords ? 'text-maple-700' : 'text-ok-600';
  return (
    <div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        disabled={disabled}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        placeholder="Rédigez votre texte ici…"
        onPaste={blockPaste ? (e) => { e.preventDefault(); onBlocked?.('paste'); } : undefined}
        onCopy={blockPaste ? (e) => { e.preventDefault(); onBlocked?.('copy'); } : undefined}
        onCut={blockPaste ? (e) => { e.preventDefault(); onBlocked?.('copy'); } : undefined}
        onDrop={blockPaste ? (e) => e.preventDefault() : undefined}
      />
      <div className="mt-1 flex justify-between text-xs">
        <span className={cx('font-semibold', tone)}>{n} mot(s)</span>
        <span className="text-muted">Attendu : {bounds.minWords} à {bounds.maxWords} mots</span>
      </div>
    </div>
  );
}

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

/**
 * Shown when the microphone cannot be used (cahier des charges p. 25, WebRTC risk): the reason, a retry, and a fallback
 * that sends a file from the phone's voice recorder (on a phone, the file picker offers to record directly).
 */
export function MicProblemNotice({ problem, maxSeconds, onRetry, onFile }: {
  problem: MicProblem; maxSeconds: number; onRetry: () => void; onFile: (file: File) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_AUDIO_BYTES) return setError('Fichier trop lourd (15 Mo au plus).');
    const seconds = await durationOf(file);
    if (seconds > maxSeconds + 5) return setError(`Enregistrement trop long : ${clock(Math.round(seconds))} pour ${clock(maxSeconds)} au plus.`);
    setError(null);
    onFile(file);
  }
  return (
    <div className="mb-3 space-y-3">
      <Notice tone="error">{MIC_MESSAGES[problem]}</Notice>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" onClick={onRetry}><Mic className="h-4 w-4" />Réessayer le micro</Button>
        <label className="cursor-pointer text-sm font-medium text-navy-700 underline">
          Ou envoyer un enregistrement fait avec le téléphone
          <input type="file" accept="audio/*" capture="user" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void pick(f); }} />
        </label>
      </div>
      {error && <Notice tone="warn">{error}</Notice>}
    </div>
  );
}

/** Microphone recorder with a hard time limit (the EO task duration). */
export function RecorderPanel({ maxSeconds, disabled, onRecorded, allowRetry = true }: {
  maxSeconds: number; disabled?: boolean; onRecorded: (blob: Blob, seconds: number) => void; allowRetry?: boolean;
}) {
  const r = useRecorder(maxSeconds);
  const remaining = maxSeconds - r.elapsed;
  return (
    <div className="rounded-xl border border-line bg-navy-50 p-4">
      {r.state === 'denied' && r.problem && <MicProblemNotice problem={r.problem} maxSeconds={maxSeconds} onRetry={() => void r.start()} onFile={(f) => void r.takeFile(f)} />}
      <div className="flex flex-wrap items-center gap-4">
        {r.state !== 'recording' ? (
          <Button onClick={() => void r.start()} disabled={disabled || (r.state === 'done' && !allowRetry)}><Mic className="h-4 w-4" />{r.state === 'done' ? 'Recommencer' : 'Commencer l’enregistrement'}</Button>
        ) : (
          <Button variant="navy" onClick={r.stop}><Square className="h-4 w-4" />Arrêter</Button>
        )}
        <div className="flex items-center gap-2 font-mono text-lg">
          {r.state === 'recording' ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-maple-600" /> : <Circle className="h-2.5 w-2.5 text-slate-400" />}
          {clock(r.elapsed)} <span className="text-sm text-muted">/ {clock(maxSeconds)}</span>
        </div>
        {r.state === 'recording' && remaining <= 30 && <span className="text-sm font-semibold text-maple-700">Plus que {remaining} s</span>}
      </div>
      {r.state === 'done' && r.url && r.blob && (
        <div className="mt-4 space-y-3">
          <audio controls src={r.url} className="w-full" />
          <Button variant="primary" onClick={() => onRecorded(r.blob!, r.elapsed)} disabled={disabled}>Envoyer pour correction</Button>
        </div>
      )}
    </div>
  );
}
