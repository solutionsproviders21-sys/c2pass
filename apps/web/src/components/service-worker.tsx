'use client';

import { useEffect } from 'react';

/** Registers the service worker (offline page, browser push). Production builds only, so dev reloads stay simple. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  }, []);
  return null;
}
