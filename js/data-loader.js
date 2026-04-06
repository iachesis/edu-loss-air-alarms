import { PATHS } from "./config.js";
import { state } from "./state.js";

function normalizeGeneric(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits || raw;
}

function normalizeOblastId(value) {
  const normalized = normalizeGeneric(value);
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) return normalized.slice(0, 2).padStart(2, "0");
  return normalized;
}

function normalizeHromadaId(value) {
  const normalized = normalizeGeneric(value);
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) return normalized.slice(0, 7);
  return normalized;
}

function normalizeLookupRow(row) {
  const next = { ...row };
  if ("oblast_id" in next) next.oblast_id = normalizeOblastId(next.oblast_id);
  if ("hromada_id" in next) next.hromada_id = normalizeHromadaId(next.hromada_id);
  if (!next.oblast_id && next.hromada_id) next.oblast_id = next.hromada_id.slice(0, 2);
  return next;
}

function normalizeRow(row) {
  const next = { ...row };

  if ("oblast_id" in next) next.oblast_id = normalizeOblastId(next.oblast_id);
  if ("hromada_id" in next) next.hromada_id = normalizeHromadaId(next.hromada_id);
  if (!next.oblast_id && next.hromada_id) next.oblast_id = next.hromada_id.slice(0, 2);

  if ("school_year" in next && next.school_year !== null && next.school_year !== undefined) {
    next.school_year = String(next.school_year);
  }
  if ("school_month" in next && next.school_month !== null && next.school_month !== undefined) {
    next.school_month = String(next.school_month);
  }

  return next;
}

function normalizePayload(data) {
  if (!Array.isArray(data)) return data;
  return data.map(normalizeRow);
}

export async function fetchJson(url) {
  if (state.cache.has(url)) return state.cache.get(url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${url} (${response.status})`);
  const raw = await response.json();
  const data = normalizePayload(raw);
  state.cache.set(url, data);
  return data;
}

export async function loadManifest() {
  const [manifest, geoManifest] = await Promise.all([
    fetchJson(PATHS.payloadManifest),
    fetchJson(PATHS.geoManifest)
  ]);
  state.manifest = manifest;
  state.geoManifest = geoManifest;
  state.options.schoolYears = manifest?.periods?.school_years ?? [];
  state.options.schoolMonths = manifest?.periods?.school_months ?? [];
  state.options.oblastIds = (manifest?.options?.oblast_ids ?? []).map((value) => normalizeOblastId(value));
  if (!state.selectedSchoolYear && state.options.schoolYears.length) {
    state.selectedSchoolYear = state.options.schoolYears[state.options.schoolYears.length - 1];
  }
  if (!state.selectedSchoolMonth && state.options.schoolMonths.length) {
    state.selectedSchoolMonth = state.options.schoolMonths[state.options.schoolMonths.length - 1];
  }
}

export async function loadNameLookups() {
  const [oblastRows, hromadaRows] = await Promise.all([
    fetchJson(PATHS.oblastNames),
    fetchJson(PATHS.hromadaNames)
  ]);

  return {
    oblastRows: Array.isArray(oblastRows) ? oblastRows.map(normalizeLookupRow) : [],
    hromadaRows: Array.isArray(hromadaRows) ? hromadaRows.map(normalizeLookupRow) : []
  };
}

export async function loadPayload(key) {
  const path = state.manifest?.files?.[key];
  if (!path) throw new Error(`Payload key not found in manifest: ${key}`);
  return fetchJson(`${PATHS.payloadBase}/${path}`);
}

export async function loadHromadaMonthPayload(oblastId) {
  const rel = state.manifest?.files?.hromada_school_month_by_oblast?.[oblastId];
  if (!rel) throw new Error(`No monthly hromada payload for oblast ${oblastId}`);
  return fetchJson(`${PATHS.payloadBase}/${rel}`);
}

export async function loadOblastGeo() {
  return fetchJson(PATHS.oblastGeo);
}

export async function loadHromadaGeo(oblastId) {
  const rel = state.geoManifest?.hromada_by_oblast?.[oblastId];
  if (!rel) throw new Error(`No hromada geo file for oblast ${oblastId}`);
  return fetchJson(`${PATHS.geoBase}/${rel}`);
}
