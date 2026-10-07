'use client';

/**
 * Reads a listening document aloud with the browser's French voice. Used while no studio
 * recording has been uploaded for a CO question (the admin can attach one at any time).
 */
export function speakFrench(text: string, { rate = 0.95, onEnd }: { rate?: number; onEnd?: () => void } = {}) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onEnd?.();
    return () => undefined;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  u.rate = rate;
  const voices = synth.getVoices();
  const voice = voices.find((v) => v.lang === 'fr-CA') ?? voices.find((v) => v.lang.startsWith('fr'));
  if (voice) u.voice = voice;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
  return () => synth.cancel();
}

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}
