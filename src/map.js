const L = window.L;
import { affectedDaysPct, formatDuration, formatNumber, isAnalyticallyUnavailable } from './logic.js';
let map, layer;
const palette = ['#EDF4F8', '#CFE1EC', '#9BC5D9', '#5B9DBB', '#286B8D', '#123B5D'];
function value(r, m) { return isAnalyticallyUnavailable(r) ? null : m === 'affected_school_days_pct' ? affectedDaysPct(r) : r[m]; }
function breaks(values) { if (!values.length)
    return [0, 0, 0, 0, 0]; const s = [...values].sort((a, b) => a - b); return [.2, .4, .6, .8].map(q => s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]); }
function colour(v, b) { if (v === null)
    return '#E5E7EB'; let i = 0; while (i < b.length && v > b[i])
    i++; return palette[i + 1] ?? palette.at(-1); }
export function renderLeafletMap(el, legend, geo, rows, measure, lang, selected, onSelect) { const byId = new Map(rows.map(r => [r.area_id, r])); const vals = rows.map(r => value(r, measure)).filter((x) => x !== null && Number.isFinite(x)); const b = breaks(vals); if (!map) {
    map = L.map(el, { attributionControl: false, zoomControl: true, minZoom: 4, maxZoom: 10, keyboard: true, preferCanvas: false });
} if (layer)
    layer.remove(); layer = L.geoJSON(geo, { style: (f) => { const id = String(f?.properties?.area_id ?? f?.properties?.id ?? ''); const r = byId.get(id); return { color: id === selected ? '#111827' : '#FFFFFF', weight: id === selected ? 3 : 1, fillColor: colour(r ? value(r, measure) : null, b), fillOpacity: .88, dashArray: !r || value(r, measure) === null ? '5 4' : undefined }; }, onEachFeature: (f, l) => { const id = String(f?.properties?.area_id ?? f?.properties?.id ?? ''); const r = byId.get(id); const name = lang === 'uk' ? (f.properties?.name_uk ?? id) : (f.properties?.name_en ?? f.properties?.name_uk ?? id); const v = r ? value(r, measure) : null; const shown = measure === 'alarm_hours_average_school_location' ? formatDuration(v, lang) : `${formatNumber(v, lang, 1)}%`; l.bindTooltip(`<strong>${name}</strong><br>${shown}`, { sticky: true }); l.on('click', () => onSelect(id)); l.on('keypress', (e) => { if (e.originalEvent?.key === 'Enter' || e.originalEvent?.key === ' ')
        onSelect(id); }); } }).addTo(map); const bounds = layer.getBounds(); if (bounds.isValid())
    map.fitBounds(bounds.pad(.04), { animate: false }); setTimeout(() => map?.invalidateSize(), 0); legend.innerHTML = ''; const labels = [`≤ ${formatNumber(b[0], lang, 1)}`, ...b.slice(1).map((x, i) => `${formatNumber(b[i], lang, 1)}–${formatNumber(x, lang, 1)}`), `> ${formatNumber(b.at(-1), lang, 1)}`]; palette.slice(1).forEach((c, i) => { const x = document.createElement('span'); x.innerHTML = `<i style="background:${c}"></i>${labels[i] ?? ''}`; legend.append(x); }); return { fitSelected() { const feature = layer.getLayers().find((l) => String(l.feature?.properties?.area_id ?? l.feature?.properties?.id) == selected); if (feature)
        map?.fitBounds(feature.getBounds().pad(.2)); else if (bounds.isValid())
        map?.fitBounds(bounds.pad(.04)); }, reset() { if (bounds.isValid())
        map?.fitBounds(bounds.pad(.04)); } }; }
