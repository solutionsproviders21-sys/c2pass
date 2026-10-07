'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function TotpQr({ url, secret }: { url: string; secret: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    void QRCode.toDataURL(url, { margin: 1, width: 180, color: { dark: '#0b1f3a' } }).then(setSrc);
  }, [url]);
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-line bg-navy-50 p-4">
      {src ? <img src={src} alt="QR code à scanner avec votre application d’authentification" width={180} height={180} /> : <div className="h-[180px] w-[180px]" />}
      <p className="text-xs text-muted">ou saisissez la clé :</p>
      <code className="break-all rounded bg-white px-2 py-1 text-center text-xs font-semibold tracking-wider">{secret.match(/.{1,4}/g)?.join(' ')}</code>
    </div>
  );
}
