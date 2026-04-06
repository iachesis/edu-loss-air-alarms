import { METRICS } from "./config.js";

export function formatMetricValue(metricKey, value) {
  const metric = METRICS[metricKey];
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const numeric = Number(value);

  if (metric?.type === "minutes") return formatMinutes(numeric);
  if (metric?.type === "ratio") return numeric.toFixed(1);
  return formatInteger(numeric);
}

export function formatInteger(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatMinutes(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatCompact(value) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatAreaName(row) {
  if (!row) return "Ukraine";
  if (row.hromada_name) return row.hromada_name;
  if (row.oblast_name) return row.oblast_name;
  if (row.hromada_id) return `Hromada ${row.hromada_id}`;
  if (row.oblast_id) return `Oblast ${row.oblast_id}`;
  return "Ukraine";
}

export function formatGeographyLabel(oblastId, hromadaId, oblastName = null, hromadaName = null) {
  if (hromadaId) return hromadaName || `Hromada ${hromadaId}`;
  if (oblastId) return oblastName || `Oblast ${oblastId}`;
  return "Ukraine";
}

export function safeText(value) {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}
