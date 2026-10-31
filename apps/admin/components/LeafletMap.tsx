'use client';

import 'leaflet/dist/leaflet.css';
import type { Map as LMap, LayerGroup } from 'leaflet';
import { useEffect, useRef } from 'react';

export interface MapMarker {
  lat: number;
  lng: number;
  color: string;
  /** Nội dung HTML khi bấm vào điểm (đã thoát ký tự). */
  popup?: string;
  /** Bán kính chấm tròn (px). */
  size?: number;
  /** Viền trắng đậm để nổi bật (VD shipper). */
  ring?: boolean;
  /** Mờ đi (VD quán đóng cửa). */
  faded?: boolean;
  href?: string;
}

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Bản đồ OpenStreetMap (miễn phí, không cần khoá API). Chỉ chạy trên trình duyệt.
 * Tự căn khung theo các điểm ở lần vẽ đầu; các lần cập nhật sau giữ nguyên vị trí người xem đang xem.
 */
export function LeafletMap({ markers, className = 'map', zoom = 15 }: { markers: MapMarker[]; className?: string; zoom?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !el.current) return;
      if (!map.current) {
        map.current = L.map(el.current, { zoomControl: true }).setView([16.0, 106.5], 6);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map.current);
        layer.current = L.layerGroup().addTo(map.current);
      }
      layer.current!.clearLayers();
      for (const m of markers) {
        const c = L.circleMarker([m.lat, m.lng], {
          radius: m.size ?? 7,
          color: m.ring ? '#ffffff' : m.color,
          weight: m.ring ? 3 : 1.5,
          fillColor: m.color,
          fillOpacity: m.faded ? 0.35 : 0.9,
          opacity: m.faded ? 0.5 : 1,
        });
        if (m.popup) c.bindPopup(m.popup);
        c.addTo(layer.current!);
      }
      if (!fitted.current && markers.length) {
        fitted.current = true;
        if (markers.length === 1) map.current.setView([markers[0].lat, markers[0].lng], zoom);
        else map.current.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng] as [number, number])).pad(0.1));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markers, zoom]);

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    [],
  );

  return <div ref={el} className={className} />;
}
