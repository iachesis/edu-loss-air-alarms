const L = window.L;

import { affectedDaysPct, formatDuration, formatNumber, isAnalyticallyUnavailable } from './logic.js';

let map;
let layer;

const palette = ['#EEF0ED', '#E1D5CF', '#D2AA9A', '#BE745A', '#993E29'];
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function value(row, measure) {
    if (isAnalyticallyUnavailable(row))
        return null;
    return measure === 'affected_school_days_pct' ? affectedDaysPct(row) : row[measure];
}

function breaks(values) {
    if (!values.length)
        return [0, 0, 0, 0];
    const sorted = [...values].sort((a, b) => a - b);
    return [.2, .4, .6, .8].map(quantile => sorted[Math.min(sorted.length - 1, Math.floor(quantile * (sorted.length - 1)))]);
}

function colour(raw, thresholds) {
    if (raw === null)
        return '#D8D7D1';
    let index = 0;
    while (index < thresholds.length && raw > thresholds[index])
        index++;
    return palette[index] ?? palette.at(-1);
}

function areaId(feature) {
    return String(feature?.properties?.area_id ?? feature?.properties?.id ?? '');
}

export function renderLeafletMap(el, legend, geo, rows, measure, lang, selected, onSelect) {
    if (!L)
        throw new Error('Map library unavailable');

    const byId = new Map(rows.map(row => [row.area_id, row]));
    const values = rows.map(row => value(row, measure)).filter(raw => raw !== null && Number.isFinite(raw));
    const thresholds = breaks(values);

    if (!map) {
        map = L.map(el, {
            attributionControl: false,
            zoomControl: true,
            minZoom: 4,
            maxZoom: 10,
            keyboard: true,
            preferCanvas: false,
        });
    }

    if (layer)
        layer.remove();

    layer = L.geoJSON(geo, {
        style: feature => {
            const id = areaId(feature);
            const row = byId.get(id);
            const raw = row ? value(row, measure) : null;
            return {
                color: id === selected ? '#182D39' : '#FCFCFA',
                weight: id === selected ? 3 : 1,
                fillColor: colour(raw, thresholds),
                fillOpacity: .92,
                dashArray: raw === null ? '5 4' : undefined,
            };
        },
        onEachFeature: (feature, featureLayer) => {
            const id = areaId(feature);
            const row = byId.get(id);
            const name = lang === 'uk'
                ? (feature.properties?.name_uk ?? id)
                : (feature.properties?.name_en ?? feature.properties?.name_uk ?? id);
            const raw = row ? value(row, measure) : null;
            const shown = measure === 'alarm_hours_average_school_location'
                ? formatDuration(raw, lang)
                : raw === null ? '—' : `${formatNumber(raw, lang, 1)}%`;
            featureLayer.bindTooltip(`<strong>${name}</strong><br>${shown}`, { sticky: true });
            featureLayer.on('mouseover', () => {
                featureLayer.setStyle({
                    color: '#182D39',
                    weight: id === selected ? 3 : 1.8,
                    fillOpacity: 1,
                });
                featureLayer.bringToFront();
            });
            featureLayer.on('mouseout', () => layer?.resetStyle(featureLayer));
            featureLayer.on('click', () => onSelect(id));
            featureLayer.on('keypress', event => {
                if (event.originalEvent?.key === 'Enter' || event.originalEvent?.key === ' ')
                    onSelect(id);
            });
        },
    }).addTo(map);

    const bounds = layer.getBounds();
    const showFullExtent = () => {
        if (!bounds.isValid())
            return false;
        map.fitBounds(bounds.pad(.04), { animate: !reducedMotion, duration: .22 });
        return true;
    };

    showFullExtent();
    setTimeout(() => map?.invalidateSize(), 0);

    legend.replaceChildren();
    const labels = [
        `≤ ${formatNumber(thresholds[0], lang, 1)}`,
        ...thresholds.slice(1).map((threshold, index) => `${formatNumber(thresholds[index], lang, 1)}–${formatNumber(threshold, lang, 1)}`),
        `> ${formatNumber(thresholds.at(-1), lang, 1)}`,
    ];
    const unit = measure === 'alarm_hours_average_school_location' ? (lang === 'uk' ? 'год' : 'hr') : '%';
    palette.forEach((swatch, index) => {
        const item = document.createElement('span');
        const chip = document.createElement('i');
        chip.style.background = swatch;
        item.append(chip, document.createTextNode(`${labels[index] ?? ''} ${unit}`));
        legend.append(item);
    });

    return {
        fitSelected() {
            if (!selected)
                return showFullExtent();
            const feature = layer.getLayers().find(candidate => areaId(candidate.feature) === selected);
            if (!feature) {
                showFullExtent();
                return false;
            }
            map.fitBounds(feature.getBounds().pad(.2), { animate: !reducedMotion, duration: .22 });
            return true;
        },
        reset() {
            return showFullExtent();
        },
    };
}
