import { METRICS, GEO_LEVELS } from "./config.js";
import { state, clearHromadaSelection } from "./state.js";
import { bindStaticElements, initControlOptions, bindControlEvents, updateSelectionSummary, updateBreadcrumbs, toggleBackButton } from "./ui-controls.js";
import { loadManifest, loadPayload, loadOblastGeo, loadHromadaGeo, loadHromadaMonthPayload, loadNameLookups } from "./data-loader.js";
import { initMap, renderGeoLayer } from "./map-view.js";
import { renderTrendChart } from "./charts.js";
import { renderRankingTable } from "./table-view.js";
import { renderDetailPanel } from "./detail-view.js";
import { formatGeographyLabel } from "./formatters.js";

const datasets = {
  nationalAllTime: [],
  nationalSchoolYear: [],
  nationalSchoolMonth: [],
  oblastAllTime: [],
  oblastSchoolYear: [],
  oblastSchoolMonth: [],
  hromadaAllTime: [],
  hromadaSchoolYear: [],
  hromadaSchoolMonthByOblast: new Map()
};

const lookups = {
  oblastById: new Map(),
  hromadaById: new Map()
};

function setStatus(message, timeoutMs = 2200) {
  const el = document.getElementById("global-status");
  el.textContent = message;
  el.classList.add("visible");
  if (timeoutMs) {
    window.clearTimeout(setStatus._timer);
    setStatus._timer = window.setTimeout(() => {
      el.classList.remove("visible");
    }, timeoutMs);
  }
}

function setInlineStatus(id, message) {
  const el = document.getElementById(id);
  if (el) el.textContent = message || "";
}

function enrichRow(row) {
  const next = { ...row };

  if (next.oblast_id && lookups.oblastById.has(next.oblast_id)) {
    next.oblast_name = lookups.oblastById.get(next.oblast_id).oblast_name;
  }

  if (next.hromada_id && lookups.hromadaById.has(next.hromada_id)) {
    const hromadaInfo = lookups.hromadaById.get(next.hromada_id);
    next.hromada_name = hromadaInfo.hromada_name;
    next.oblast_name = next.oblast_name || hromadaInfo.oblast_name || next.oblast_name;
    next.oblast_id = next.oblast_id || hromadaInfo.oblast_id || next.oblast_id;
  }

  return next;
}

function enrichRows(rows) {
  return rows.map(enrichRow);
}

async function ensureBaseDatasets() {
  const [
    nationalAllTime,
    nationalSchoolYear,
    nationalSchoolMonth,
    oblastAllTime,
    oblastSchoolYear,
    oblastSchoolMonth,
    hromadaAllTime,
    hromadaSchoolYear
  ] = await Promise.all([
    loadPayload("national_all_time"),
    loadPayload("national_school_year"),
    loadPayload("national_school_month"),
    loadPayload("oblast_all_time"),
    loadPayload("oblast_school_year"),
    loadPayload("oblast_school_month"),
    loadPayload("hromada_all_time"),
    loadPayload("hromada_school_year")
  ]);

  datasets.nationalAllTime = enrichRows(nationalAllTime);
  datasets.nationalSchoolYear = enrichRows(nationalSchoolYear);
  datasets.nationalSchoolMonth = enrichRows(nationalSchoolMonth);
  datasets.oblastAllTime = enrichRows(oblastAllTime);
  datasets.oblastSchoolYear = enrichRows(oblastSchoolYear);
  datasets.oblastSchoolMonth = enrichRows(oblastSchoolMonth);
  datasets.hromadaAllTime = enrichRows(hromadaAllTime);
  datasets.hromadaSchoolYear = enrichRows(hromadaSchoolYear);
}

async function ensureHromadaMonthDataset(oblastId) {
  if (datasets.hromadaSchoolMonthByOblast.has(oblastId)) return datasets.hromadaSchoolMonthByOblast.get(oblastId);
  const rows = enrichRows(await loadHromadaMonthPayload(oblastId));
  datasets.hromadaSchoolMonthByOblast.set(oblastId, rows);
  return rows;
}

function getNationalRow() {
  if (state.selectedTimeGranularity === "all_time") return datasets.nationalAllTime[0] || null;
  if (state.selectedTimeGranularity === "school_year") {
    return datasets.nationalSchoolYear.find((row) => row.school_year === state.selectedSchoolYear) || null;
  }
  return datasets.nationalSchoolMonth.find(
    (row) => row.school_year === state.selectedSchoolYear && row.school_month === state.selectedSchoolMonth
  ) || null;
}

function getOblastRowsForCurrentPeriod() {
  if (state.selectedTimeGranularity === "all_time") return datasets.oblastAllTime;
  if (state.selectedTimeGranularity === "school_year") {
    return datasets.oblastSchoolYear.filter((row) => row.school_year === state.selectedSchoolYear);
  }
  return datasets.oblastSchoolMonth.filter(
    (row) => row.school_year === state.selectedSchoolYear && row.school_month === state.selectedSchoolMonth
  );
}

function getHromadaRowsForCurrentPeriod() {
  if (!state.selectedOblastId) return [];
  if (state.selectedTimeGranularity === "all_time") {
    return datasets.hromadaAllTime.filter((row) => row.oblast_id === state.selectedOblastId);
  }
  if (state.selectedTimeGranularity === "school_year") {
    return datasets.hromadaSchoolYear.filter(
      (row) => row.oblast_id === state.selectedOblastId && row.school_year === state.selectedSchoolYear
    );
  }
  const rows = datasets.hromadaSchoolMonthByOblast.get(state.selectedOblastId) || [];
  return rows.filter((row) => row.school_year === state.selectedSchoolYear && row.school_month === state.selectedSchoolMonth);
}

function getCurrentDetailRow() {
  if (state.selectedHromadaId) {
    return getHromadaRowsForCurrentPeriod().find((row) => row.hromada_id === state.selectedHromadaId) || null;
  }
  if (state.selectedOblastId) {
    return getOblastRowsForCurrentPeriod().find((row) => row.oblast_id === state.selectedOblastId) || null;
  }
  return getNationalRow();
}

function getCurrentMapRows() {
  return state.currentGeoLevel === GEO_LEVELS.HROMADA ? getHromadaRowsForCurrentPeriod() : getOblastRowsForCurrentPeriod();
}

function getTrendSeries() {
  if (state.selectedHromadaId) {
    if (state.selectedTimeGranularity === "school_month") {
      const monthly = datasets.hromadaSchoolMonthByOblast.get(state.selectedOblastId) || [];
      return monthly
        .filter((row) => row.hromada_id === state.selectedHromadaId)
        .map((row) => ({ label: row.school_month, value: row[state.selectedMetric] ?? 0 }));
    }
    return datasets.hromadaSchoolYear
      .filter((row) => row.hromada_id === state.selectedHromadaId)
      .map((row) => ({ label: row.school_year, value: row[state.selectedMetric] ?? 0 }));
  }

  if (state.selectedOblastId) {
    if (state.selectedTimeGranularity === "school_month") {
      return datasets.oblastSchoolMonth
        .filter((row) => row.oblast_id === state.selectedOblastId)
        .map((row) => ({ label: row.school_month, value: row[state.selectedMetric] ?? 0 }));
    }
    return datasets.oblastSchoolYear
      .filter((row) => row.oblast_id === state.selectedOblastId)
      .map((row) => ({ label: row.school_year, value: row[state.selectedMetric] ?? 0 }));
  }

  if (state.selectedTimeGranularity === "school_month") {
    return datasets.nationalSchoolMonth.map((row) => ({ label: row.school_month, value: row[state.selectedMetric] ?? 0 }));
  }
  return datasets.nationalSchoolYear.map((row) => ({ label: row.school_year, value: row[state.selectedMetric] ?? 0 }));
}

function renderSelectionSummaryAndBreadcrumbs() {
  const detailRow = getCurrentDetailRow();
  const geographyLabel = formatGeographyLabel(
    state.selectedOblastId,
    state.selectedHromadaId,
    detailRow?.oblast_name,
    detailRow?.hromada_name
  );

  updateSelectionSummary({
    metricLabel: METRICS[state.selectedMetric]?.label || state.selectedMetric,
    timeViewLabel: state.selectedTimeGranularity.replace("_", " "),
    schoolYear: state.selectedTimeGranularity === "all_time" ? null : state.selectedSchoolYear,
    schoolMonth: state.selectedTimeGranularity === "school_month" ? state.selectedSchoolMonth : null,
    geographyLabel
  });

  updateBreadcrumbs([
    "Ukraine",
    state.selectedOblastId ? (detailRow?.oblast_name || `Oblast ${state.selectedOblastId}`) : null,
    state.selectedHromadaId ? (detailRow?.hromada_name || `Hromada ${state.selectedHromadaId}`) : null
  ]);
  toggleBackButton(Boolean(state.selectedOblastId));
}

function renderRanking() {
  const tbody = document.getElementById("ranking-table-body");
  const rows = getCurrentMapRows();
  renderRankingTable(tbody, rows, handleRankingSelect);

  document.getElementById("ranking-caption").textContent =
    state.currentGeoLevel === GEO_LEVELS.OBLAST
      ? `Top oblasts by ${METRICS[state.selectedMetric]?.label?.toLowerCase() || "selected metric"}.`
      : `Top hromadas in the selected oblast by ${METRICS[state.selectedMetric]?.label?.toLowerCase() || "selected metric"}.`;

  document.getElementById("ranking-metric-header").textContent = METRICS[state.selectedMetric]?.shortLabel || "Metric";
}

function renderDetail() {
  renderDetailPanel(document.getElementById("detail-panel-content"), getCurrentDetailRow());
}

function renderTrend() {
  const series = getTrendSeries();
  renderTrendChart(
    document.getElementById("trend-chart"),
    series,
    METRICS[state.selectedMetric]?.label || state.selectedMetric
  );
  setInlineStatus("chart-status", series.length ? "" : "No time-series data for the current selection.");
}

function buildMapContextLine() {
  const detailRow = getCurrentDetailRow();
  const geographyLabel = formatGeographyLabel(
    state.selectedOblastId,
    state.selectedHromadaId,
    detailRow?.oblast_name,
    detailRow?.hromada_name
  );
  const metricLabel = METRICS[state.selectedMetric]?.label || state.selectedMetric;
  const timeLabel = state.selectedTimeGranularity === "all_time"
    ? "All time"
    : state.selectedTimeGranularity === "school_month"
      ? `${state.selectedSchoolMonth}`
      : `${state.selectedSchoolYear}`;
  return `${geographyLabel} · ${metricLabel} · ${timeLabel}`;
}

async function renderMap() {
  setInlineStatus("map-status", "Loading map data…");
  document.getElementById("map-caption").textContent = buildMapContextLine();

  if (state.currentGeoLevel === GEO_LEVELS.OBLAST) {
    const geo = await loadOblastGeo();
    renderGeoLayer(geo, getOblastRowsForCurrentPeriod(), handleMapSelect);
  } else {
    const geo = await loadHromadaGeo(state.selectedOblastId);
    renderGeoLayer(geo, getHromadaRowsForCurrentPeriod(), handleMapSelect);
  }

  setInlineStatus("map-status", "");
}

function openDrawer(drawer, button = null) {
  if (!drawer) return;
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  if (button) button.setAttribute("aria-expanded", "true");
}

function closeDrawer(drawer, button = null) {
  if (!drawer) return;
  drawer.classList.remove("open");
  drawer.setAttribute("aria-hidden", "true");
  if (button) button.setAttribute("aria-expanded", "false");
}

async function handleMapSelect(id) {
  try {
    if (state.currentGeoLevel === GEO_LEVELS.OBLAST) {
      state.selectedOblastId = id;
      state.selectedHromadaId = null;
      state.currentGeoLevel = GEO_LEVELS.HROMADA;
      if (state.selectedTimeGranularity === "school_month") {
        setInlineStatus("map-status", "Loading hromada monthly data…");
        await ensureHromadaMonthDataset(id);
      }
      await refreshDashboard();
      return;
    }

    state.selectedHromadaId = id;
    renderSelectionSummaryAndBreadcrumbs();
    renderDetail();
    renderTrend();
    await renderMap();
  } catch (error) {
    console.error(error);
    setStatus("Unable to update the selection.");
  }
}

function handleRankingSelect(areaId) {
  if (!areaId) return;
  if (state.currentGeoLevel === GEO_LEVELS.OBLAST) {
    handleMapSelect(areaId);
    return;
  }
  state.selectedHromadaId = areaId;
  renderSelectionSummaryAndBreadcrumbs();
  renderDetail();
  renderTrend();
  renderMap();
}

async function refreshDashboard() {
  renderSelectionSummaryAndBreadcrumbs();

  if (state.currentGeoLevel === GEO_LEVELS.HROMADA && state.selectedTimeGranularity === "school_month" && state.selectedOblastId) {
    await ensureHromadaMonthDataset(state.selectedOblastId);
  }

  renderRanking();
  renderDetail();
  renderTrend();
  await renderMap();
}

async function bootstrap() {
  bindStaticElements();

  const rankingsDrawer = document.getElementById("rankings-drawer");
  const openRankingsButton = document.getElementById("open-rankings-button");
  const closeRankingsButton = document.getElementById("close-rankings-button");
  const rankingsBackdrop = document.getElementById("rankings-drawer-backdrop");

  openRankingsButton?.addEventListener("click", () => openDrawer(rankingsDrawer, openRankingsButton));
  closeRankingsButton?.addEventListener("click", () => closeDrawer(rankingsDrawer, openRankingsButton));
  rankingsBackdrop?.addEventListener("click", () => closeDrawer(rankingsDrawer, openRankingsButton));

  initMap("map");

  try {
    setStatus("Loading dashboard data…", 0);
    await loadManifest();

    const { oblastRows, hromadaRows } = await loadNameLookups();
    lookups.oblastById = new Map(oblastRows.map((row) => [row.oblast_id, row]));
    lookups.hromadaById = new Map(hromadaRows.map((row) => [row.hromada_id, row]));

    initControlOptions();
    bindControlEvents(async () => {
      clearHromadaSelection();
      if (!state.selectedOblastId) state.currentGeoLevel = GEO_LEVELS.OBLAST;
      await refreshDashboard();
    });

    await ensureBaseDatasets();
    await refreshDashboard();
    setStatus("Dashboard ready.");
  } catch (error) {
    console.error(error);
    setStatus("Dashboard data could not be loaded.");
    setInlineStatus("map-status", "Map data could not be loaded.");
    setInlineStatus("chart-status", "Chart data could not be loaded.");
  }
}

bootstrap();
