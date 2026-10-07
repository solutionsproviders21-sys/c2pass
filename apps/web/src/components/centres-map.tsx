'use client';

import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { CENTRE_STATUS_LABELS, type CentreStatus } from '@c2pass/shared';
import type { Centre } from '@/lib/types';

const COLORS: Record<CentreStatus, string> = { open: '#1e9e5a', closed: '#94a3b8', full: '#d52b1e', soon: '#d97706' };

function icon(status: CentreStatus, selected: boolean) {
  const size = selected ? 34 : 26;
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path fill="${COLORS[status]}" stroke="white" stroke-width="1.5" d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="2.6" fill="white"/></svg>`,
  });
}

function Fit({ centres, selected }: { centres: Centre[]; selected?: string | null }) {
  const map = useMap();
  useEffect(() => {
    const target = centres.find((c) => c.id === selected);
    if (target?.lat && target.lng) {
      map.flyTo([target.lat, target.lng], 12, { duration: 0.6 });
      return;
    }
    const pts = centres.filter((c) => c.lat && c.lng).map((c) => [c.lat!, c.lng!] as [number, number]);
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 11 });
  }, [centres, selected, map]);
  return null;
}

export default function CentresMap({ centres, selected, onSelect, height = 420 }: { centres: Centre[]; selected?: string | null; onSelect?: (id: string) => void; height?: number }) {
  return (
    <MapContainer center={[2.5, 15]} zoom={4} style={{ height, width: '100%' }} scrollWheelZoom={false}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Fit centres={centres} selected={selected} />
      {centres.filter((c) => c.lat && c.lng).map((c) => (
        <Marker key={c.id} position={[c.lat!, c.lng!]} icon={icon(c.status, c.id === selected)} eventHandlers={{ click: () => onSelect?.(c.id) }}>
          <Popup>
            <strong>{c.name}</strong><br />{c.city} · {CENTRE_STATUS_LABELS[c.status]}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
