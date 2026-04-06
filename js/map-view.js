import { CHART_COLORS, CHOROPLETH_SETTINGS, METRICS } from "./config.js";
import { formatAreaName, formatMetricValue } from "./formatters.js";
import { state } from "./state.js";

let map;
let geoLayer;
let legendControl;

const DEFAULT_BORDER_COLOR = "#f5f7f8";
const HOVER_BORDER_COLOR = "#1cabe2";

function getNumericValues(rows, metricKey) {
  return rows
    .map((row) => Number(row?.[metricKey]))
    .filter((value) => Number.isFinite(value));
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function winsorizeValues(values, upperQuantile = 0.95) {
  if (!values.length || upperQuantile === null || upperQuantile === undefined) {
    return { values: [...values], cap: null };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const cap = percentile(sorted, upperQuantile);
  return {
    values: values.map((v) => Math.min(v, cap)),
    cap
  };
}

function getQuantileBreaks(values, classCount = 5) {
  if (!values.length) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const breaks = [];

  for (let i = 1; i < classCount; i += 1) {
    const boundary = percentile(sorted, i / classCount);
    if (boundary !== null && Number.isFinite(boundary)) {
      breaks.push(boundary);
    }
  }

  const deduped = [];
  for (const value of breaks) {
    if (!deduped.length || value > deduped[deduped.length - 1]) {
      deduped.push(value);
    }
  }
  return deduped;
}

function getColorForBreaks(value, breaks, colors) {
  if (!Number.isFinite(value)) return colors[0];
  for (let i = 0; i < breaks.length; i += 1) {
    if (value <= breaks[i]) return colors[i];
  }
  return colors[Math.min(colors.length - 1, breaks.length)];
}

function formatLegendNumber(value, metricType) {
  if (!Number.isFinite(value)) return "—";
  if (metricType === "ratio") {
    return Number(value).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    });
  }
  return Math.round(value).toLocaleString("en-US");
}

function buildLegendBins(breaks, colors, minValue) {
  const bins = [];
  let lower = minValue;

  for (let i = 0; i < colors.length; i += 1) {
    const upper = breaks[i] ?? null;
    bins.push({
      color: colors[i],
      lower,
      upper
    });
    if (upper !== null && Number.isFinite(upper)) {
      lower = upper;
    }
  }
  return bins;
}

function getMetricSettings() {
  const category = METRICS[state.selectedMetric]?.category || "default";
  return CHOROPLETH_SETTINGS[category] || CHOROPLETH_SETTINGS.default;
}

function getMetricValue(row, metricKey, capValue = null) {
  const value = Number(row?.[metricKey]);
  if (!Number.isFinite(value)) return null;
  return capValue !== null ? Math.min(value, capValue) : value;
}

function getFeatureBaseStyle(row, breaks, palette, cap) {
  const value = getMetricValue(row, state.selectedMetric, cap);
  return {
    color: DEFAULT_BORDER_COLOR,
    weight: state.currentGeoLevel === "hromada" ? 1.6 : 2.2,
    opacity: 1,
    fillOpacity: 0.94,
    fillColor: getColorForBreaks(value, breaks, palette),
  };
}

function applyHoverStyle(layer) {
  layer.setStyle({
    color: HOVER_BORDER_COLOR,
    weight: state.currentGeoLevel === "hromada" ? 2.2 : 3,
    fillOpacity: 1,
  });
  layer.bringToFront();
}

function resetHoverStyle(layer, row, breaks, palette, cap) {
  layer.setStyle(getFeatureBaseStyle(row, breaks, palette, cap));
}

export function initMap(containerId) {
  map = L.map(containerId, {
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
  }).setView([49.0, 31.5], 6);

  legendControl = L.control({ position: "bottomright" });
  legendControl.onAdd = () => {
    const div = L.DomUtil.create("div", "legend");
    div.innerHTML = `<strong id="legend-title">${METRICS[state.selectedMetric]?.label || "Metric"}</strong><div id="legend-content"></div>`;
    return div;
  };
  legendControl.addTo(map);

  return map;
}

function setLegend(rawValues, breaks, colors, cap = null) {
  const title = document.getElementById("legend-title");
  if (title) {
    title.textContent = METRICS[state.selectedMetric]?.label || "Metric";
  }

  const container = document.getElementById("legend-content");
  if (!container) return;
  if (!rawValues.length) {
    container.textContent = "No data";
    return;
  }

  const minValue = Math.min(...rawValues);
  const metricType = METRICS[state.selectedMetric]?.type || "count";
  const bins = buildLegendBins(breaks, colors, minValue);

  container.innerHTML = bins.map((bin, index) => {
    let label;
    if (index === bins.length - 1) {
      const lowerLabel = formatLegendNumber(bin.lower, metricType);
      label = `${lowerLabel}+`;
    } else {
      const lowerLabel = formatLegendNumber(bin.lower, metricType);
      const upperLabel = formatLegendNumber(bin.upper, metricType);
      label = `${lowerLabel}–${upperLabel}`;
    }

    return `
      <div class="legend-row">
        <span class="legend-swatch" style="background:${bin.color}"></span>
        <span>${label}</span>
      </div>
    `;
  }).join("");
}

export function renderGeoLayer(geojson, rows, onSelect) {
  if (geoLayer) geoLayer.remove();

  const settings = getMetricSettings();
  const rawValues = getNumericValues(rows, state.selectedMetric);
  const { values: colorValues, cap } = winsorizeValues(rawValues, settings.winsorizeUpperQuantile);
  const breaks = settings.method === "quantile"
    ? getQuantileBreaks(colorValues, settings.classes)
    : [];
  const palette = CHART_COLORS.slice(0, settings.classes);

  const rowById = new Map();
  rows.forEach((row) => {
    const key = row.hromada_id || row.oblast_id;
    rowById.set(String(key), row);
  });

  geoLayer = L.geoJSON(geojson, {
    style: (feature) => {
      const id = String(feature?.properties?.id ?? "");
      const row = rowById.get(id);
      return getFeatureBaseStyle(row, breaks, palette, cap);
    },
    onEachFeature: (feature, layer) => {
      const id = String(feature?.properties?.id ?? "");
      const row = rowById.get(id);
      const name = row ? formatAreaName(row) : `Area ${id}`;
      const metricValue = row
        ? formatMetricValue(state.selectedMetric, row[state.selectedMetric])
        : "—";

      layer.bindTooltip(`<strong>${name}</strong><br>${metricValue}`, {
        sticky: true,
      });

      layer.on("mouseover", () => applyHoverStyle(layer));
      layer.on("mouseout", () => resetHoverStyle(layer, row, breaks, palette, cap));
      layer.on("click", () => onSelect(id, row));
    },
  }).addTo(map);

  const bounds = geoLayer.getBounds();
  if (bounds.isValid()) {
    map.invalidateSize();
    map.fitBounds(bounds, {
      padding: [12, 12],
      maxZoom: 9,
    });
  }

  setLegend(rawValues, breaks, palette, cap);
}

export function getMap() {
  return map;
}
