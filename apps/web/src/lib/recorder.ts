'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Why the microphone cannot be used: each case gets its own message and the file fallback. */
export type MicProblem = 'denied' | 'nomic' | 'busy' | 'unsupported';

/** Opus at 32 kbit/s: clear speech, about 1.2 MB for a 5-minute answer, light enough for a 3G connection. */
const AUDIO_BITS_PER_SECOND = 32_000;

export const MIC_MESSAGES: Record<MicProblem, string> = {
  denied: 'Accès au micro refusé. Autorisez le micro dans les réglages du navigateur, puis réessayez.',
  nomic: 'Aucun micro détecté. Branchez un micro ou un casque, puis réessayez.',
  busy: 'Le micro est utilisé par une autre application (appel, visioconférence). Fermez-la, puis réessayez.',
  unsupported: 'Ce navigateur ne permet pas d’enregistrer. Utilisez Chrome, Firefox ou Safari à jour.',
};

export function problemOf(e: unknown): MicProblem {
  const name = e instanceof Error ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'nomic';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  return 'unsupported';
}

export function canRecord() {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
}

/** Microphone recording through MediaRecorder (WebRTC getUserMedia), with an optional hard time limit. */
export function useRecorder(maxSeconds?: number) {
  const [state, setState] = useState<'idle' | 'recording' | 'done' | 'denied'>('idle');
  const [problem, setProblem] = useState<MicProblem | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const started = useRef(0);

  const stop = useCallback(() => {
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
    if (timer.current) clearInterval(timer.current);
  }, []);

  const start = useCallback(async () => {
    try {
      if (!canRecord()) throw new Error('unsupported');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
      const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported?.(m));
      const r = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        if (timer.current) clearInterval(timer.current);
        stream.getTracks().forEach((t) => t.stop());
        const b = new Blob(chunks, { type: (r.mimeType || 'audio/webm').split(';')[0] });
        setBlob(b);
        setUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(b);
        });
        setState('done');
      };
      // A micro unplugged or taken by a phone call mid-answer: keep what was said so far.
      stream.getAudioTracks().forEach((t) => t.addEventListener('ended', () => stop()));
      rec.current = r;
      r.start(1000);
      started.current = Date.now();
      setElapsed(0);
      setProblem(null);
      setState('recording');
      timer.current = setInterval(() => {
        const s = Math.floor((Date.now() - started.current) / 1000);
        setElapsed(s);
        if (maxSeconds && s >= maxSeconds) stop();
      }, 250);
    } catch (e) {
      setProblem(problemOf(e));
      setState('denied');
    }
  }, [maxSeconds, stop]);

  /** Fallback when the microphone cannot be used: a file from the phone's voice recorder. */
  const takeFile = useCallback(async (file: File) => {
    const seconds = await durationOf(file);
    setBlob(file);
    setUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(file);
    });
    setElapsed(Math.round(seconds));
    setState('done');
    return seconds;
  }, []);

  const reset = useCallback(() => {
    setBlob(null);
    setUrl(null);
    setElapsed(0);
    setState('idle');
  }, []);

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current);
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop();
  }, []);

  return { state, problem, elapsed, blob, url, start, stop, reset, takeFile };
}

/** Length of an audio file in seconds (0 when the browser cannot read it). */
export function durationOf(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const a = document.createElement('audio');
    const u = URL.createObjectURL(file);
    const done = (v: number) => { URL.revokeObjectURL(u); resolve(Number.isFinite(v) ? v : 0); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(a.duration);
    a.onerror = () => done(0);
    a.src = u;
  });
}

/**
 * Sends a recording, retrying network failures (3 attempts, 2 s then 5 s apart) so a weak connection does not lose an
 * answer. Errors returned by the server (refused, too long…) are not retried.
 */
export async function sendWithRetry<T>(send: () => Promise<T>, delays = [2000, 5000]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await send();
    } catch (e) {
      const status = (e as { status?: number }).status;
      const network = status === undefined || status === 0 || status >= 500 || status === 408;
      if (!network || i >= delays.length) throw e;
      await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
}

export function extensionFor(type: string) {
  return type.includes('ogg') ? 'ogg' : type.includes('mp4') || type.includes('m4a') || type.includes('aac') ? 'm4a' : type.includes('mpeg') ? 'mp3' : type.includes('wav') ? 'wav' : 'webm';
}
