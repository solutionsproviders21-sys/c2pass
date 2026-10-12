'use client';

import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { Button, Card, Notice } from '@/components/ui';
import { api } from '@/lib/api';

type State = 'loading' | 'unsupported' | 'unconfigured' | 'denied' | 'off' | 'on';

function keyBytes(base64url: string) {
  const b64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Browser notifications for centre alerts on this device, even when C2Pass is closed. */
export function PushToggle() {
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setState('unsupported');
      const { publicKey } = await api.get<{ publicKey: string | null }>('/push/key');
      if (!publicKey) return setState('unconfigured');
      setPublicKey(publicKey);
      if (Notification.permission === 'denied') return setState('denied');
      const reg = await navigator.serviceWorker.getRegistration();
      setState((await reg?.pushManager.getSubscription()) ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      if ((await Notification.requestPermission()) !== 'granted') return setState('denied');
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) });
      await api.post('/push/subscriptions', sub.toJSON());
      setState('on');
    } catch {
      setError('Impossible d’activer les notifications sur cet appareil. Réessayez, ou gardez les alertes par e-mail et SMS.');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
      if (sub) {
        await api.post('/push/unsubscribe', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState('off');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading' || state === 'unconfigured') return null;
  return (
    <Card>
      <p className="flex items-center gap-2 font-semibold text-navy-900"><BellRing className="h-4 w-4" />Notifications sur cet appareil</p>
      <p className="mt-1 text-sm text-muted">Recevez l’alerte d’ouverture d’un centre sur ce téléphone ou cet ordinateur, même quand C2Pass est fermé.</p>
      <div className="mt-3">
        {state === 'unsupported' && <Notice tone="warn">Ce navigateur ne permet pas les notifications. Sur iPhone, ajoutez d’abord C2Pass à l’écran d’accueil (Partager, puis « Sur l’écran d’accueil »).</Notice>}
        {state === 'denied' && <Notice tone="warn">Les notifications sont bloquées pour C2Pass. Autorisez-les dans les réglages du navigateur, puis rechargez la page.</Notice>}
        {state === 'off' && <Button size="sm" busy={busy} onClick={enable}>Activer sur cet appareil</Button>}
        {state === 'on' && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-ok-600">Activées sur cet appareil</span>
            <Button size="sm" variant="secondary" busy={busy} onClick={disable}>Désactiver</Button>
          </div>
        )}
        {error && <div className="mt-3"><Notice tone="warn">{error}</Notice></div>}
      </div>
    </Card>
  );
}
