const L = window.L;

import { affectedDaysPct, formatDuration, formatNumber, isAnalyticallyUnavailable } from './logic.js';

let map;
let layer;
let fullExtentControl;

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

export function renderLeafletMap(el, legend, geo, rows, measure, lang, selected, onSelect, onFullExtent) {
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
            maxZoom: 14,
            zoomSnap: .25,
            zoomDelta: .5,
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
            const status = raw !== null ? '' : row?.coverage_status === 'not_covered'
                ? (lang === 'uk' ? 'Не охоплено джерелом' : 'Not covered by source')
                : (lang === 'uk' ? 'Недоступно' : 'Unavailable');
            featureLayer.bindTooltip(`<strong>${name}</strong><br>${status || shown}`, { sticky: true });
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
        map.fitBounds(bounds.pad(.025), { animate: !reducedMotion, duration: .22 });
        return true;
    };

    if (fullExtentControl)
        fullExtentControl.remove();
    fullExtentControl = L.control({ position: 'bottomright' });
    fullExtentControl.onAdd = () => {
        const container = L.DomUtil.create('div', 'leaflet-bar aae-full-extent-control');
        const button = L.DomUtil.create('button', 'aae-full-extent-button', container);
        const label = lang === 'uk' ? 'Показати всю карту' : 'Show full map';
        button.type = 'button';
        button.title = label;
        button.setAttribute('aria-label', label);
        button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path d="M4.5 9.8 12 3.9l7.5 5.9v9.1h-5.1v-5.3H9.6v5.3H4.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);
        L.DomEvent.on(button, 'click', event => {
            L.DomEvent.preventDefault(event);
            if (showFullExtent())
                onFullExtent?.();
        });
        // Leaflet intercepts native keyboard activation in this control container.
        // Prevent the intercepted default and converge on the single click path.
        L.DomEvent.on(button, 'keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ')
                return;
            L.DomEvent.preventDefault(event);
            button.click();
        });
        return container;
    };
    fullExtentControl.addTo(map);

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
            map.fitBounds(feature.getBounds().pad(.065), { animate: !reducedMotion, duration: .22 });
            return true;
        },
        reset() {
            return showFullExtent();
        },
    };
}
