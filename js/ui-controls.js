import { METRICS, TIME_GRANULARITIES, DEFAULTS, METRIC_GROUPS } from "./config.js";
import { state, clearOblastAndHromadaSelection } from "./state.js";
import { safeText } from "./formatters.js";

const els = {};

export function bindStaticElements() {
  els.metricSelect = document.getElementById("metric-select");
  els.timeGranularitySelect = document.getElementById("time-granularity-select");
  els.schoolYearSelect = document.getElementById("school-year-select");
  els.schoolMonthSelect = document.getElementById("school-month-select");
  els.schoolYearGroup = document.getElementById("school-year-group");
  els.schoolMonthGroup = document.getElementById("school-month-group");
  els.rankScopeSelect = document.getElementById("rank-scope-select");
  els.resetButton = document.getElementById("reset-button");
  els.selectionSummaryList = document.getElementById("selection-summary-list");
  els.methodologyButton = document.getElementById("methodology-button");
  els.methodologyDrawer = document.getElementById("methodology-drawer");
  els.methodologyCloseButton = document.getElementById("methodology-close-button");
  els.drawerBackdrop = document.getElementById("drawer-backdrop");
  els.breadcrumbs = document.getElementById("breadcrumbs");
  els.backToOblastsButton = document.getElementById("back-to-oblasts-button");
  return els;
}

export function initControlOptions() {
  const grouped = Object.entries(METRIC_GROUPS).map(([groupKey, groupLabel]) => {
    const options = Object.entries(METRICS)
      .filter(([, meta]) => meta.category === groupKey)
      .map(([value, meta]) => `<option value="${value}">${meta.label}</option>`)
      .join("");
    return `<optgroup label="${groupLabel}">${options}</optgroup>`;
  }).join("");

  els.metricSelect.innerHTML = grouped;

  els.timeGranularitySelect.innerHTML = TIME_GRANULARITIES
    .map(({ value, label }) => `<option value="${value}">${label}</option>`)
    .join("");

  refreshTimeSelects();
  els.metricSelect.value = state.selectedMetric;
  els.timeGranularitySelect.value = state.selectedTimeGranularity;
  els.rankScopeSelect.value = state.rankScope;
}

export function refreshTimeSelects() {
  els.schoolYearSelect.innerHTML = state.options.schoolYears
    .map((value) => `<option value="${value}">${value.replace("_", "–")}</option>`)
    .join("");

  els.schoolMonthSelect.innerHTML = state.options.schoolMonths
    .map((value) => `<option value="${value}">${value}</option>`)
    .join("");

  if (state.selectedSchoolYear) els.schoolYearSelect.value = state.selectedSchoolYear;
  if (state.selectedSchoolMonth) els.schoolMonthSelect.value = state.selectedSchoolMonth;

  const tg = state.selectedTimeGranularity;
  els.schoolYearGroup.classList.toggle("hidden", tg === "all_time");
  els.schoolMonthGroup.classList.toggle("hidden", tg !== "school_month");
}

export function bindControlEvents(onChange) {
  els.metricSelect.addEventListener("change", () => {
    state.selectedMetric = els.metricSelect.value;
    onChange();
  });

  els.timeGranularitySelect.addEventListener("change", () => {
    state.selectedTimeGranularity = els.timeGranularitySelect.value;
    refreshTimeSelects();
    onChange();
  });

  els.schoolYearSelect.addEventListener("change", () => {
    state.selectedSchoolYear = els.schoolYearSelect.value;
    onChange();
  });

  els.schoolMonthSelect.addEventListener("change", () => {
    state.selectedSchoolMonth = els.schoolMonthSelect.value;
    onChange();
  });

  els.rankScopeSelect.addEventListener("change", () => {
    state.rankScope = els.rankScopeSelect.value;
    onChange();
  });

  els.resetButton.addEventListener("click", () => {
    state.selectedMetric = DEFAULTS.metric;
    state.selectedTimeGranularity = DEFAULTS.timeGranularity;
    state.rankScope = DEFAULTS.rankScope;
    state.selectedSchoolYear = state.options.schoolYears[state.options.schoolYears.length - 1] ?? null;
    state.selectedSchoolMonth = state.options.schoolMonths[state.options.schoolMonths.length - 1] ?? null;
    clearOblastAndHromadaSelection();
    initControlOptions();
    onChange();
  });

  els.methodologyButton.addEventListener("click", openMethodologyDrawer);
  els.methodologyCloseButton.addEventListener("click", closeMethodologyDrawer);
  els.drawerBackdrop.addEventListener("click", closeMethodologyDrawer);
  els.backToOblastsButton.addEventListener("click", () => {
    clearOblastAndHromadaSelection();
    onChange();
  });
}

export function openMethodologyDrawer() {
  els.methodologyDrawer.classList.add("open");
  els.methodologyDrawer.setAttribute("aria-hidden", "false");
  els.methodologyButton.setAttribute("aria-expanded", "true");
  document.body.classList.add("drawer-open");
}

export function closeMethodologyDrawer() {
  els.methodologyDrawer.classList.remove("open");
  els.methodologyDrawer.setAttribute("aria-hidden", "true");
  els.methodologyButton.setAttribute("aria-expanded", "false");
  document.body.classList.remove("drawer-open");
}

export function updateSelectionSummary(summary) {
  if (!els.selectionSummaryList) return;
  const rows = [
    ["Metric", summary.metricLabel],
    ["Time view", summary.timeViewLabel],
    ["School year", summary.schoolYear || "—"],
    ["School month", summary.schoolMonth || "—"],
    ["Geography", summary.geographyLabel]
  ];
  els.selectionSummaryList.innerHTML = rows.map(([k, v]) => `<div><dt>${safeText(k)}</dt><dd>${safeText(v)}</dd></div>`).join("");
}

export function updateBreadcrumbs(parts) {
  if (!els.breadcrumbs) return;
  els.breadcrumbs.textContent = parts.filter(Boolean).join(" / ");
}

export function toggleBackButton(show) {
  els.backToOblastsButton.classList.toggle("hidden", !show);
}

export function getElements() {
  return els;
}
