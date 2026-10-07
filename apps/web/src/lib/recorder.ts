'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Microphone recording through MediaRecorder (WebRTC getUserMedia), with an optional hard time limit. */
export function useRecorder(maxSeconds?: number) {
  const [state, setState] = useState<'idle' | 'recording' | 'done' | 'denied'>('idle');
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported?.(m));
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const b = new Blob(chunks, { type: (r.mimeType || 'audio/webm').split(';')[0] });
        setBlob(b);
        setUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(b);
        });
        setState('done');
      };
      rec.current = r;
      r.start(1000);
      started.current = Date.now();
      setElapsed(0);
      setState('recording');
      timer.current = setInterval(() => {
        const s = Math.floor((Date.now() - started.current) / 1000);
        setElapsed(s);
        if (maxSeconds && s >= maxSeconds) stop();
      }, 250);
    } catch {
      setState('denied');
    }
  }, [maxSeconds, stop]);

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

  return { state, elapsed, blob, url, start, stop, reset };
}

export function extensionFor(type: string) {
  return type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
}
