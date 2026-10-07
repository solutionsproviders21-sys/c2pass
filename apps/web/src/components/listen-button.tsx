'use client';

import { useEffect, useRef, useState } from 'react';
import { Headphones, Loader2, Volume2 } from 'lucide-react';
import { speakFrench } from '@/lib/speech';
import { Button } from './ui';

export type AudioSource = { url: string } | { blob: Blob } | { tts: string };

/**
 * Plays a listening document: a real recording when one exists, otherwise the browser's
 * French voice reading the transcript.
 */
export function useAudioPlayback() {
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const cancel = useRef<() => void>(() => undefined);

  useEffect(() => () => {
    cancel.current();
    audio.current?.pause();
  }, []);

  function play(src: AudioSource, onEnd?: () => void) {
    cancel.current();
    audio.current?.pause();
    setPlaying(true);
    const done = () => {
      setPlaying(false);
      onEnd?.();
    };
    if ('tts' in src) {
      cancel.current = speakFrench(src.tts, { onEnd: done });
      return;
    }
    const url = 'blob' in src ? URL.createObjectURL(src.blob) : src.url;
    const a = new Audio(url);
    audio.current = a;
    a.onended = done;
    a.onerror = done;
    void a.play().catch(done);
    cancel.current = () => a.pause();
  }

  return { playing, play };
}

export function ListenButton({ onClick, playing, loading, disabled, label = 'Écouter le document' }: { onClick: () => void; playing: boolean; loading?: boolean; disabled?: boolean; label?: string }) {
  return (
    <Button variant="navy" size="lg" onClick={onClick} disabled={disabled || playing} busy={loading}>
      {playing ? <><Volume2 className="h-5 w-5 animate-pulse" />Écoute en cours…</> : loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Headphones className="h-5 w-5" />{label}</>}
    </Button>
  );
}
