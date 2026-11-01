'use client';

import 'leaflet/dist/leaflet.css';
import type { Map as LMap, LayerGroup, LatLngBoundsExpression } from 'leaflet';
import { useEffect, useRef } from 'react';

export interface MapMarker {
  lat: number;
  lng: number;
  color: string;
  /** Biểu tượng trong ghim (emoji). Không có thì vẽ chấm tròn nhỏ. */
  icon?: string;
  /** Nội dung HTML khi bấm vào điểm (đã thoát ký tự). */
  popup?: string;
  /** Kích thước ghim (px). */
  size?: number;
  /** Mờ đi (VD quán đóng cửa). */
  faded?: boolean;
  /** Vẽ trên cùng (VD shipper). */
  top?: boolean;
  /** Hiệu ứng nhấp nháy (VD shipper đang chạy chuyến). */
  pulse?: boolean;
}

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Nền bản đồ CARTO Voyager: sáng, rõ tên đường, miễn phí (ghi nguồn OSM + CARTO). Lỗi thì quay về OSM gốc.
const TILES = {
  carto: { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>', subdomains: 'abcd' },
  osm: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', subdomains: 'abc' },
};

/**
 * Bản đồ dùng Leaflet + nền miễn phí, không cần khoá API. Chỉ chạy trên trình duyệt.
 * Tự căn khung theo các điểm ở lần vẽ đầu; các lần cập nhật sau giữ nguyên vị trí người xem đang xem.
 */
export function LeafletMap({ markers, className = 'map', zoom = 15, fitSignal = 0 }: { markers: MapMarker[]; className?: string; zoom?: number; fitSignal?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const fitted = useRef(false);
  const lastFit = useRef(fitSignal);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !el.current) return;
      if (!map.current) {
        const m = L.map(el.current, { zoomControl: true, preferCanvas: false }).setView([16.0, 106.5], 6);
        let tiles = L.tileLayer(TILES.carto.url, { maxZoom: 20, attribution: TILES.carto.attribution, subdomains: TILES.carto.subdomains, detectRetina: true }).addTo(m);
        let errors = 0;
        tiles.on('tileerror', () => {
          if (++errors !== 6) return;
          m.removeLayer(tiles);
          tiles = L.tileLayer(TILES.osm.url, { maxZoom: 19, attribution: TILES.osm.attribution }).addTo(m);
        });
        layer.current = L.layerGroup().addTo(m);
        map.current = m;
        // Khung chứa đổi kích thước (thu/mở menu, xoay màn hình) thì vẽ lại, tránh mảng xám.
        const ro = new ResizeObserver(() => m.invalidateSize());
        ro.observe(el.current);
        m.on('unload', () => ro.disconnect());
      }
      layer.current!.clearLayers();
      for (const mk of markers) {
        const size = mk.size ?? (mk.icon ? 30 : 10);
        const html = mk.icon
          ? `<div class="pin${mk.pulse ? ' pulse' : ''}" style="--c:${mk.color};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.52)}px;opacity:${mk.faded ? 0.45 : 1}">${mk.icon}</div>`
          : `<div class="dot" style="--c:${mk.color};width:${size}px;height:${size}px;opacity:${mk.faded ? 0.45 : 1}"></div>`;
        const icon = L.divIcon({ html, className: 'sqt-marker', iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2] });
        const marker = L.marker([mk.lat, mk.lng], { icon, zIndexOffset: mk.top ? 1000 : 0, riseOnHover: true });
        if (mk.popup) marker.bindPopup(mk.popup);
        marker.addTo(layer.current!);
      }
      const fitAll = () => {
        if (!markers.length) return;
        if (markers.length === 1) map.current!.setView([markers[0].lat, markers[0].lng], zoom);
        else map.current!.fitBounds(markers.map((m) => [m.lat, m.lng]) as LatLngBoundsExpression, { padding: [36, 36] });
      };
      if ((!fitted.current && markers.length) || lastFit.current !== fitSignal) {
        fitted.current = true;
        lastFit.current = fitSignal;
        fitAll();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [markers, zoom, fitSignal]);

  useEffect(
    () => () => {
      map.current?.remove();
      map.current = null;
    },
    [],
  );

  return <div ref={el} className={className} />;
}
