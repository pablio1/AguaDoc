import { useEffect, useRef } from 'react';
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../../lib/maplibreWorker';
import { DEFAULT_CENTER, emptyLineCollection, fallbackStyle, geoStyleUrl, lineFeature, toLineCoords } from '../../lib/geoapify';
import { apiGetMapsConfig } from '../../api';

/**
 * MapLibre map powered by Geoapify styles.
 * Props:
 * - theme: 'light' | 'dark'
 * - center: {lat,lng}
 * - zoom
 * - markers: [{ id, lat, lng, html, anchor?, popupHtml?, draggable?, onDragEnd? }]
 * - routes: [{ id, geometry ([[lng,lat]] or [lat,lng] if geometryFormat='latlng'), color, width, opacity, dashArray?, onClick? }]
 * - geometryFormat: 'lnglat' | 'latlng'
 * - follow: { enabled, lat, lng, bearing, pitch, zoom }
 * - fitPoints: [[lat,lng], ...]
 * - onMapClick({lat,lng})
 * - onUserDrag()
 * - className / style
 */
export default function GeoMap({
  theme = 'light',
  center = DEFAULT_CENTER,
  zoom = 14,
  markers = [],
  routes = [],
  geometryFormat = 'lnglat',
  follow = null,
  fitPoints = null,
  onMapClick,
  onUserDrag,
  className = '',
  style,
  interactive = true,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new globalThis.Map());
  const routeHandlersRef = useRef(new globalThis.Map());
  const followBooted = useRef(false);
  const lastBearing = useRef(0);
  const apiKeyRef = useRef('');
  const onMapClickRef = useRef(onMapClick);
  const onUserDragRef = useRef(onUserDrag);

  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onUserDragRef.current = onUserDrag; }, [onUserDrag]);

  // Init map once
  useEffect(() => {
    let cancelled = false;
    let map;

    async function boot() {
      const cfg = await apiGetMapsConfig().catch(() => ({ apiKey: '' }));
      if (cancelled || !containerRef.current) return;
      apiKeyRef.current = cfg.apiKey || '';
      const styleUrl = geoStyleUrl(apiKeyRef.current, theme) || fallbackStyle(theme);

      map = new MapLibreMap({
        container: containerRef.current,
        style: styleUrl,
        center: [Number(center.lng), Number(center.lat)],
        zoom,
        interactive,
        attributionControl: true,
      });
      map.addControl(new NavigationControl({ visualizePitch: true }), 'top-right');
      mapRef.current = map;

      const ensureRouteLayers = () => {
        if (map.getSource('aguadoc-routes')) return;
        map.addSource('aguadoc-routes', { type: 'geojson', data: emptyLineCollection() });
        map.addLayer({
          id: 'aguadoc-routes-casing',
          type: 'line',
          source: 'aguadoc-routes',
          paint: {
            'line-color': '#ffffff',
            'line-width': ['+', ['get', 'width'], 6],
            'line-opacity': 0.95,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        map.addLayer({
          id: 'aguadoc-routes-line',
          type: 'line',
          source: 'aguadoc-routes',
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['get', 'width'],
            'line-opacity': ['get', 'opacity'],
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
      };

      map.on('load', () => {
        ensureRouteLayers();
        map.resize();
      });

      // Invalid Geoapify key / style → fall back to raster basemap instead of a black canvas
      let fellBack = false;
      map.on('error', (e) => {
        const msg = e?.error?.message || String(e?.error || '');
        if (fellBack || !/style|tile|fetch|401|403|404|failed/i.test(msg)) return;
        if (!apiKeyRef.current) return;
        fellBack = true;
        apiKeyRef.current = '';
        map.setStyle(fallbackStyle(theme));
        map.once('style.load', ensureRouteLayers);
      });

      map.on('click', (e) => {
        onMapClickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      });
      map.on('dragstart', () => onUserDragRef.current?.());

      // Flex/absolute parents often need a second resize after layout settles
      requestAnimationFrame(() => map.resize());
      setTimeout(() => map.resize(), 250);
    }

    boot();
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once; theme handled below
  }, []);

  // Theme / style swap
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const nextStyle = geoStyleUrl(apiKeyRef.current, theme) || fallbackStyle(theme);
    map.setStyle(nextStyle);
    map.once('style.load', () => {
      if (!map.getSource('aguadoc-routes')) {
        map.addSource('aguadoc-routes', { type: 'geojson', data: emptyLineCollection() });
        map.addLayer({
          id: 'aguadoc-routes-casing',
          type: 'line',
          source: 'aguadoc-routes',
          paint: {
            'line-color': '#ffffff',
            'line-width': ['+', ['get', 'width'], 6],
            'line-opacity': 0.95,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        map.addLayer({
          id: 'aguadoc-routes-line',
          type: 'line',
          source: 'aguadoc-routes',
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['get', 'width'],
            'line-opacity': ['get', 'opacity'],
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
      }
    });
  }, [theme]);

  // Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const nextIds = new Set(markers.map((m) => String(m.id)));
    markersRef.current.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    markers.forEach((m) => {
      if (m.lat == null || m.lng == null) return;
      const id = String(m.id);
      const html = m.html || `<div style="width:14px;height:14px;border-radius:50%;background:#2563EB;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)"></div>`;
      let marker = markersRef.current.get(id);
      const prevHtml = marker?.getElement()?.dataset?.aguadocHtml;

      if (marker && prevHtml !== html) {
        marker.remove();
        markersRef.current.delete(id);
        marker = null;
      }

      if (!marker) {
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        const el = wrap.firstElementChild || wrap;
        el.dataset.aguadocHtml = html;
        el.style.cursor = m.draggable ? 'grab' : 'pointer';
        marker = new Marker({
          element: el,
          anchor: m.anchor || 'center',
          draggable: Boolean(m.draggable),
        })
          .setLngLat([Number(m.lng), Number(m.lat)])
          .addTo(map);
        if (m.popupHtml) marker.setPopup(new Popup({ offset: 16 }).setHTML(m.popupHtml));
        if (m.draggable && m.onDragEnd) {
          marker.on('dragend', () => {
            const { lng, lat } = marker.getLngLat();
            m.onDragEnd({ lat, lng });
          });
        }
        markersRef.current.set(id, marker);
      } else {
        marker.setLngLat([Number(m.lng), Number(m.lat)]);
        if (m.popupHtml) {
          const popup = marker.getPopup();
          if (popup) popup.setHTML(m.popupHtml);
          else marker.setPopup(new Popup({ offset: 16 }).setHTML(m.popupHtml));
        }
      }
    });
  }, [markers]);

  // Routes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource('aguadoc-routes');
      if (!source) return;
      const features = routes
        .map((r) => {
          const coords = toLineCoords(r.geometry, geometryFormat);
          if (coords.length < 2) return null;
          const f = lineFeature(coords);
          f.properties = {
            id: r.id,
            color: r.color || '#1A73E8',
            width: r.width || 6,
            opacity: r.opacity ?? 1,
          };
          return f;
        })
        .filter(Boolean);
      source.setData({ type: 'FeatureCollection', features });
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);

    // Click handlers per route id via layer click + properties
    const onClick = (e) => {
      const f = e.features?.[0];
      if (!f) return;
      const id = f.properties?.id;
      const route = routes.find((r) => String(r.id) === String(id));
      route?.onClick?.(route);
    };
    if (map.getLayer('aguadoc-routes-line')) {
      map.off('click', 'aguadoc-routes-line', routeHandlersRef.current.get('click'));
      map.on('click', 'aguadoc-routes-line', onClick);
      routeHandlersRef.current.set('click', onClick);
      map.on('mouseenter', 'aguadoc-routes-line', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'aguadoc-routes-line', () => { map.getCanvas().style.cursor = ''; });
    }
  }, [routes, geometryFormat]);

  // Fit bounds
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitPoints?.length) return;
    const valid = fitPoints.filter((p) => p?.[0] != null && p?.[1] != null);
    if (!valid.length) return;
    if (valid.length === 1) {
      map.easeTo({ center: [Number(valid[0][1]), Number(valid[0][0])], zoom: 15, duration: 500 });
      return;
    }
    const bounds = new LngLatBounds();
    valid.forEach(([lat, lng]) => bounds.extend([Number(lng), Number(lat)]));
    map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 600 });
  }, [fitPoints]);

  // Navigation follow camera
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !follow) return;

    if (!follow.enabled || follow.lat == null || follow.lng == null) {
      followBooted.current = false;
      if (follow.resetNorth) {
        map.easeTo({ bearing: 0, pitch: 0, duration: 300 });
      }
      return;
    }

    const targetBearing = Number.isFinite(follow.bearing) ? follow.bearing : lastBearing.current;
    const diff = ((targetBearing - lastBearing.current + 540) % 360) - 180;
    const smoothed = (lastBearing.current + diff * 0.4 + 360) % 360;
    lastBearing.current = smoothed;
    const first = !followBooted.current;
    followBooted.current = true;

    // Look slightly ahead along bearing
    const rad = (smoothed * Math.PI) / 180;
    const aheadM = 90;
    const dLat = (aheadM / 111320) * Math.cos(rad);
    const dLng = (aheadM / (111320 * Math.cos((follow.lat * Math.PI) / 180))) * Math.sin(rad);

    map.easeTo({
      center: [Number(follow.lng) + dLng, Number(follow.lat) + dLat],
      zoom: follow.zoom ?? 17.2,
      bearing: smoothed,
      pitch: follow.pitch ?? 50,
      duration: first ? 700 : 350,
      essential: true,
    });
  }, [follow]);

  // Resize observer
  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return undefined;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`h-full w-full min-h-[220px] bg-[#dbe4ee] ${className}`}
      style={style}
    />
  );
}
