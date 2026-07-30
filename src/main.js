import { ALL_MONTHS, SCHOOL_YEAR_LABELS, affectedDaysPct, aggregateRange, defaultState, educationContexts, formatDuration, formatNumber, isAnalyticallyUnavailable, mapScopeForArea, monthLabel, periodBounds, periodLabel, saveLanguage, stateFromUrl, updateUrl } from './logic.js';
import { initI18n, setLanguage, tr } from './i18n.js';
import { createGeographyFuse, createSearchItems, itemLabel, itemName, itemParent, searchGeography } from './search.js';
import { renderLeafletMap } from './map.js';
import { heatmapChart, modalityChart, monthlyChart, resizeCharts, schoolYearChart } from './charts.js';
const $ = (id) => document.getElementById(id);
let data, state, searchItems, fuse, mapActions, currentRows = [];
let sortKey = 'school_time_under_alarm_pct', sortDirection = -1;
const hromadaLoadFailures = new Set();
function normalize(raw) { if (raw.area_level !== 'hromada')
    return raw; return { area_level: 'hromada', area_id: raw.hromada_id, school_year: raw.school_year, period_type: raw.period_type, period_id: raw.period_id, alarm_seconds_average_school_location: raw.alarm_seconds, alarm_hours_average_school_location: raw.alarm_hours, available_school_seconds_average_school_location: raw.available_school_seconds, expected_school_seconds_average_school_location: raw.expected_school_seconds, school_time_under_alarm_pct: raw.school_time_under_alarm_pct, affected_school_days_average_school_location: raw.affected_school_days, available_school_days_average_school_location: raw.available_school_days, expected_school_days_average_school_location: raw.expected_school_days, school_time_alarm_episodes_average_school_location: raw.school_time_alarm_episodes, source_precision_label: raw.source_precision_label, coverage_status: raw.coverage_status, school_count: raw.school_count, learners_total: raw.learners_total, learners_offline: raw.learners_offline, learners_online: raw.learners_online, learners_mixed: raw.learners_mixed, education_snapshot_date: raw.education_snapshot_date }; }
async function json(path) { const r = await fetch(path); if (!r.ok)
    throw new Error(`${path}: ${r.status}`); return r.json(); }
async function loadData() { const [release, lookup, nationalMonthly, nationalYear, oblastMonthly, oblastYear, oblastGeo] = await Promise.all([json('./data/release.json'), json('./data/geography_lookup.json'), json('./data/national_monthly.json'), json('./data/national_school_year.json'), json('./data/oblast_monthly.json'), json('./data/oblast_school_year.json'), json('./data/geography/oblasts.geojson')]); return { release, lookup, nationalMonthly, nationalYear, oblastMonthly, oblastYear, oblastGeo, hromadaMonthly: {}, hromadaYear: {}, hromadaGeo: {} }; }
async function ensureHromada(oblastId) {
    if (!data.lookup.prototype_hromada_oblasts.includes(oblastId))
        return false;
    if (data.hromadaMonthly[oblastId])
        return true;
    const status = $('area-load-status');
    status.hidden = false;
    status.textContent = tr('loadingArea');
    $('dashboard').setAttribute('aria-busy', 'true');
    try {
        const [m, y, g] = await Promise.all([json(`./data/hromada_monthly_${oblastId}.json`), json(`./data/hromada_school_year_${oblastId}.json`), json(`./data/geography/hromadas/${oblastId}.geojson`)]);
        data.hromadaMonthly[oblastId] = m.map(normalize);
        data.hromadaYear[oblastId] = y.map(normalize);
        data.hromadaGeo[oblastId] = g;
        hromadaLoadFailures.delete(oblastId);
        status.hidden = true;
        return true;
    }
    catch (error) {
        console.error(error);
        hromadaLoadFailures.add(oblastId);
        status.hidden = false;
        status.textContent = tr('loadAreaFailed');
        return false;
    }
    finally {
        $('dashboard').setAttribute('aria-busy', 'false');
    }
}
function parentOblast(id) { return data.lookup.hromadas[id]?.oblast_id ?? (data.lookup.oblasts[id] ? id : undefined); }
function nameOf(id, lang = state.lang) { if (id === 'UA')
    return data.lookup.national.UA[lang]; const x = data.lookup.oblasts[id] ?? data.lookup.hromadas[id]; return x?.[lang] ?? id; }
function monthlyRows(id = state.areaId) { if (id === 'UA')
    return data.nationalMonthly; if (data.lookup.oblasts[id])
    return data.oblastMonthly.filter(r => r.area_id === id); const o = parentOblast(id); return o ? (data.hromadaMonthly[o] ?? []).filter(r => r.area_id === id) : []; }
function yearRows(id = state.areaId) { if (id === 'UA')
    return data.nationalYear; if (data.lookup.oblasts[id])
    return data.oblastYear.filter(r => r.area_id === id); const o = parentOblast(id); return o ? (data.hromadaYear[o] ?? []).filter(r => r.area_id === id) : []; }
function rowForState(id = state.areaId) { if (state.periodMode === 'school_year')
    return yearRows(id).find(r => r.school_year === state.schoolYear) ?? null; if (state.periodMode === 'month')
    return monthlyRows(id).find(r => r.period_id === state.month) ?? null; const b = periodBounds(state); return aggregateRange(monthlyRows(id), b.start, b.end); }
function value(r, key) { return isAnalyticallyUnavailable(r) ? null : key === 'affected_school_days_pct' ? affectedDaysPct(r) : r[key]; }
function periodRowsForComparison(forOblast) { const ids = forOblast ? Object.entries(data.lookup.hromadas).filter(([, x]) => x.oblast_id === forOblast).map(([id]) => id) : Object.keys(data.lookup.oblasts); return ids.map(id => rowForState(id)).filter((r) => Boolean(r)); }
function periodContext() { const b = periodBounds(state); return educationContexts([...monthlyRows(), ...yearRows()], b.start, b.end); }
function statusText(x) { return x === 'complete' ? tr('complete') : x === 'partial' ? tr('partial') : tr('unavailable'); }
function applyStaticTranslations() { document.querySelectorAll('[data-t]').forEach(el => { el.textContent = tr(el.dataset.t); }); document.title = tr('appTitle'); $('page-title').textContent = tr('appTitle'); $('page-subtitle').textContent = tr('subtitle'); document.querySelectorAll('[data-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang))); const params = `?lang=${state.lang}`; document.querySelectorAll('[data-page]').forEach(a => { const page = a.dataset.page; a.href = `./${page}.html${params}`; }); }
function option(value, label) { const o = document.createElement('option'); o.value = value; o.textContent = label; return o; }
function populatePeriodControls() { const mode = $('period-mode'); if (!mode.options.length) {
    [['school_year', 'schoolYear'], ['month', 'month'], ['custom_range', 'customRange'], ['all_available', 'allAvailable']].forEach(([v, k]) => mode.append(option(v, tr(k))));
}
else
    [...mode.options].forEach(o => o.textContent = tr(o.value === 'custom_range' ? 'customRange' : o.value === 'all_available' ? 'allAvailable' : o.value)); mode.value = state.periodMode; const sy = $('school-year'); sy.replaceChildren(...data.release.available_school_years.map(y => option(y, SCHOOL_YEAR_LABELS[y]))); sy.value = state.schoolYear; const mo = $('month'); mo.replaceChildren(...ALL_MONTHS.map(m => option(m, monthLabel(m, state.lang)))); mo.value = state.month; for (const id of ['range-start', 'range-end']) {
    const s = $(id);
    s.replaceChildren(...ALL_MONTHS.map(m => option(m, `${monthLabel(m, state.lang)} · ${SCHOOL_YEAR_LABELS[schoolYearForMonthSafe(m)]}`)));
    s.value = id === 'range-start' ? state.rangeStart : state.rangeEnd;
} $('school-year-field').hidden = state.periodMode !== 'school_year'; $('month-field').hidden = state.periodMode !== 'month'; $('range-fields').hidden = state.periodMode !== 'custom_range'; $('all-period-note').hidden = state.periodMode !== 'all_available'; }
function schoolYearForMonthSafe(m) { const [y, n] = m.split('-').map(Number); return n >= 9 ? `${y}_${y + 1}` : `${y - 1}_${y}`; }
function renderSearchResults(query = '') { const box = $('territory-results'); const selected = searchItems.find(x => x.id === state.areaId); $('territory-search').value = query || itemName(selected, state.lang); const results = searchGeography(fuse, searchItems, query, 12); box.replaceChildren(); $('territory-result-count').textContent = String(results.length); if (!results.length) {
    box.innerHTML = `<li class="no-result">${tr('searchNoResults')}</li>`;
    return;
} for (const x of results) {
    const li = document.createElement('li'), b = document.createElement('button'), strong = document.createElement('strong'), small = document.createElement('small');
    b.type = 'button';
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', String(x.id === state.areaId));
    b.setAttribute('aria-label', itemLabel(x, state.lang));
    b.dataset.area = x.id;
    strong.textContent = itemName(x, state.lang);
    small.textContent = x.level === 'hromada' ? `${itemParent(x, state.lang)} · ${x.katottg}` : x.katottg;
    b.append(strong, small);
    b.addEventListener('click', async () => { state.areaId = x.id; const o = parentOblast(x.id); if (o)
        await ensureHromada(o); box.hidden = true; updateUrl(state); await render(); });
    li.append(b);
    box.append(li);
} }
function setupTerritoryCombobox() { const input = $('territory-search'), box = $('territory-results'); input.placeholder = tr('territoryHint'); input.addEventListener('focus', () => { box.hidden = false; renderSearchResults(input.value === itemName(searchItems.find(x => x.id === state.areaId), state.lang) ? '' : input.value); }); input.addEventListener('input', () => { box.hidden = false; renderSearchResults(input.value); }); input.addEventListener('keydown', e => { const buttons = [...box.querySelectorAll('button')]; if (e.key === 'ArrowDown') {
    e.preventDefault();
    buttons[0]?.focus();
} if (e.key === 'Escape')
    box.hidden = true; }); box.addEventListener('keydown', e => { const buttons = [...box.querySelectorAll('button')], i = buttons.indexOf(document.activeElement); if (e.key === 'ArrowDown') {
    e.preventDefault();
    buttons[Math.min(buttons.length - 1, i + 1)]?.focus();
} if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (i <= 0)
        input.focus();
    else
        buttons[i - 1]?.focus();
} if (e.key === 'Escape') {
    box.hidden = true;
    input.focus();
} }); document.addEventListener('click', e => { if (!e.target.closest('.territory-combobox'))
    box.hidden = true; }); }
function periodHeading() { return `${nameOf(state.areaId)} · ${periodLabel(state, state.lang)}`; }
function renderSummary(row) { $('summary-context').textContent = periodHeading(); if (isAnalyticallyUnavailable(row)) {
    $('summary-text').textContent = `${nameOf(row.area_id)}: ${tr('analyticalUnavailable')}`;
    $('aggregation-note').textContent = tr('unavailable');
    return;
} const pct = formatNumber(row.school_time_under_alarm_pct, state.lang, 1), hours = formatDuration(row.alarm_hours_average_school_location, state.lang), days = formatNumber(row.affected_school_days_average_school_location, state.lang, row.area_level === 'hromada' ? 0 : 1), den = formatNumber(row.available_school_days_average_school_location, state.lang, row.area_level === 'hromada' ? 0 : 1); $('summary-text').textContent = state.lang === 'uk' ? `${nameOf(row.area_id)}: ${hours} перетину тривог із припущеним навчальним часом (${pct}%). Тривоги припали на ${days} із ${den} доступних навчальних днів.` : `${nameOf(row.area_id)}: ${hours} of alarm overlap with assumed school time (${pct}%). Alarms occurred on ${days} of ${den} available school days.`; $('aggregation-note').textContent = row.area_level === 'hromada' ? tr('directResult') : tr('averageLocation'); }
function renderCards(row) { const unavailable = isAnalyticallyUnavailable(row); $('alarm-time-value').textContent = formatDuration(unavailable ? null : row.alarm_hours_average_school_location, state.lang); $('alarm-time-secondary').textContent = unavailable ? tr('unavailable') : `${formatNumber(row.school_time_under_alarm_pct, state.lang, 1)}%`; $('affected-days-value').textContent = unavailable ? '—' : `${formatNumber(row.affected_school_days_average_school_location, state.lang, row.area_level === 'hromada' ? 0 : 1)} / ${formatNumber(row.available_school_days_average_school_location, state.lang, row.area_level === 'hromada' ? 0 : 1)}`; $('affected-days-secondary').textContent = unavailable ? tr('unavailable') : `${formatNumber(affectedDaysPct(row), state.lang, 1)}%`; const ep = unavailable ? null : row.school_time_alarm_episodes_average_school_location; $('episodes-value').textContent = ep === null ? '—' : formatNumber(ep, state.lang, row.area_level === 'hromada' ? 0 : 1); $('episodes-secondary').textContent = unavailable ? tr('unavailable') : ep === null ? tr('noEpisodesRange') : (row.area_level === 'hromada' ? tr('directResult') : tr('averageLocation')); }
function renderEducation() { const contexts = periodContext(), multi = contexts.length > 1; const summary = $('education-summary'), details = $('education-years'); summary.replaceChildren(); details.replaceChildren(); if (!multi) {
    const c = contexts[0];
    if (!c)
        return;
    summary.innerHTML = `<div><span>${tr('schools')}</span><strong>${formatNumber(c.row.school_count, state.lang)}</strong></div><div><span>${tr('learners')}</span><strong>${formatNumber(c.row.learners_total, state.lang)}</strong></div><small>${tr('snapshot')} ${new Intl.DateTimeFormat(state.lang === 'uk' ? 'uk-UA' : 'en-GB', { dateStyle: 'long' }).format(new Date(c.row.education_snapshot_date + 'T00:00:00Z'))}</small>`;
}
else {
    $('education-multi-note').hidden = false;
    $('education-multi-note').textContent = tr('multiYearContext');
    for (const c of contexts) {
        const row = document.createElement('div');
        row.className = 'education-year-row';
        row.innerHTML = `<strong>${SCHOOL_YEAR_LABELS[c.schoolYear]}</strong><span>${tr('schools')}: ${formatNumber(c.row.school_count, state.lang)}</span><span>${tr('learners')}: ${formatNumber(c.row.learners_total, state.lang)}</span><small>${c.row.education_snapshot_date}</small>`;
        details.append(row);
    }
} $('education-multi-note').hidden = !multi; const chartRows = contexts.map(c => c.row); modalityChart($('modality-chart'), chartRows, state.lang); $('education-note').textContent = `${tr('contextCaveat')} ${contexts.some(c => c.schoolYear === '2022_2023') ? tr('modality2022') : tr('modalityLater')}`; }
function renderChartTable(el, rows, labelKey) { const table = document.createElement('table'); table.innerHTML = `<thead><tr><th>${labelKey === 'period_id' ? tr('month') : tr('schoolYear')}</th><th>${tr('hours')}</th><th>${tr('alarmShare')}</th><th>${tr('daysShare')}</th></tr></thead><tbody></tbody>`; const body = table.querySelector('tbody'); for (const r of rows) {
    const trr = document.createElement('tr');
    const label = labelKey === 'period_id' ? monthLabel(r.period_id, state.lang) : SCHOOL_YEAR_LABELS[r.school_year];
    const unavailable = isAnalyticallyUnavailable(r);
    [label, formatNumber(unavailable ? null : r.alarm_hours_average_school_location, state.lang, 2), unavailable ? '—' : formatNumber(r.school_time_under_alarm_pct, state.lang, 2) + '%', unavailable ? '—' : formatNumber(affectedDaysPct(r), state.lang, 2) + '%'].forEach((x, i) => { const c = document.createElement(i ? 'td' : 'th'); c.textContent = x; trr.append(c); });
    body.append(trr);
} el.replaceChildren(table); }
async function renderTime() { const monthly = monthlyRows(), yearly = yearRows(); document.querySelectorAll('[data-temporal]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.temporal === state.temporalView))); $('monthly-panel').hidden = state.temporalView !== 'monthly'; $('year-panel').hidden = state.temporalView !== 'school_years'; $('heatmap-panel').hidden = state.temporalView !== 'heatmap'; $('chart-error').hidden = true; try {
    if (state.temporalView === 'monthly') {
        monthlyChart($('monthly-chart'), monthly, state.trendMeasure, state.lang, id => { state.periodMode = 'month'; state.month = id; updateUrl(state); render(); });
        renderChartTable($('monthly-data'), monthly, 'period_id');
    }
    if (state.temporalView === 'school_years') {
        schoolYearChart($('year-chart'), yearly, state.trendMeasure, state.lang);
        renderChartTable($('year-data'), yearly, 'school_year');
    }
    if (state.temporalView === 'heatmap') {
        heatmapChart($('heatmap-chart'), monthly, state.lang);
        renderChartTable($('heatmap-data'), monthly, 'period_id');
    }
}
catch (e) {
    console.error(e);
    $('chart-error').hidden = false;
    $('chart-error').textContent = state.lang === 'uk' ? 'Візуалізація недоступна; дані залишаються в таблиці.' : 'Visualisation unavailable; data remain available in the table.';
    renderChartTable($('monthly-data'), monthly, 'period_id');
} }
async function renderMapAndTable() { const scope = mapScopeForArea(state.areaId, data.lookup), oblastId = scope.oblastId, atHromada = scope.level === 'hromada'; if (atHromada && !(await ensureHromada(oblastId))) {
    currentRows = [];
    renderComparison();
    $('map-error').hidden = false;
    $('map-error').textContent = tr('loadAreaFailed');
    return;
} const rows = periodRowsForComparison(atHromada ? oblastId : undefined), geo = atHromada ? data.hromadaGeo[oblastId] : data.oblastGeo, selected = data.lookup.hromadas[state.areaId] ? state.areaId : ''; currentRows = rows; renderComparison(); const geometryUnavailable = data.lookup.hromadas[state.areaId]?.geometry_status !== undefined && data.lookup.hromadas[state.areaId]?.geometry_status !== 'available'; $('map-error').hidden = !geometryUnavailable; if (geometryUnavailable)
    $('map-error').textContent = tr('geometryUnavailable'); try {
    mapActions = renderLeafletMap($('map-container'), $('map-legend'), geo, rows, state.mapMeasure, state.lang, selected, id => { state.areaId = id; updateUrl(state); render(); });
}
catch (e) {
    console.error(e);
    $('map-error').hidden = false;
    $('map-error').textContent = state.lang === 'uk' ? 'Карта недоступна; вибір території та значення залишаються в таблиці.' : 'Map unavailable; area selection and values remain available in the table.';
} }
function renderComparison() { const query = $('comparison-search').value.trim(); let rows = currentRows; if (query)
    rows = fuse.search(query, { limit: 300 }).map((x) => x.item.id).filter((id) => rows.some(r => r.area_id === id)).map((id) => rows.find(r => r.area_id === id)); rows = [...rows].sort((a, b) => { const av = sortKey === 'affected_days_pct' ? affectedDaysPct(a) : a[sortKey], bv = sortKey === 'affected_days_pct' ? affectedDaysPct(b) : b[sortKey]; return ((av ?? -Infinity) - (bv ?? -Infinity)) * sortDirection; }); const desktop = $('comparison-table'), mobile = $('comparison-cards'); desktop.innerHTML = '<table><thead><tr><th>' + tr('area') + '</th><th><button data-sort="school_time_under_alarm_pct">' + tr('share') + '</button></th><th><button data-sort="alarm_hours_average_school_location">' + tr('hours') + '</button></th><th><button data-sort="affected_days_pct">' + tr('days') + '</button></th><th>' + tr('precision') + '</th><th>' + tr('coverage') + '</th></tr></thead><tbody></tbody></table>'; const tbody = desktop.querySelector('tbody'); mobile.replaceChildren(); for (const r of rows) {
    const unavailable = isAnalyticallyUnavailable(r);
    const td = [nameOf(r.area_id), unavailable ? '—' : `${formatNumber(r.school_time_under_alarm_pct, state.lang, 1)}%`, formatDuration(unavailable ? null : r.alarm_hours_average_school_location, state.lang), unavailable ? '—' : `${formatNumber(affectedDaysPct(r), state.lang, 1)}%`, r.source_precision_label, statusText(r.coverage_status)];
    const trr = document.createElement('tr');
    td.forEach((x, i) => { const cell = document.createElement(i ? 'td' : 'th'); if (i === 0) {
        const b = document.createElement('button');
        b.textContent = x;
        b.addEventListener('click', () => { state.areaId = r.area_id; updateUrl(state); render(); });
        cell.append(b);
    }
    else
        cell.textContent = x; trr.append(cell); });
    tbody.append(trr);
    const d = document.createElement('details');
    d.className = 'comparison-card';
    d.innerHTML = `<summary><strong>${td[0]}</strong><span>${td[1]}</span><small>${td[2]} · ${td[3]}</small></summary><dl><div><dt>${tr('episodes')}</dt><dd>${unavailable || r.school_time_alarm_episodes_average_school_location === null ? '—' : formatNumber(r.school_time_alarm_episodes_average_school_location, state.lang, 1)}</dd></div><div><dt>${tr('schools')}</dt><dd>${formatNumber(r.school_count, state.lang)}</dd></div><div><dt>${tr('learners')}</dt><dd>${formatNumber(r.learners_total, state.lang)}</dd></div><div><dt>${tr('precision')}</dt><dd>${r.source_precision_label}</dd></div><div><dt>${tr('coverage')}</dt><dd>${statusText(r.coverage_status)}</dd></div></dl>`;
    mobile.append(d);
} desktop.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.sort; if (sortKey === k)
    sortDirection *= -1;
else {
    sortKey = k;
    sortDirection = -1;
} renderComparison(); })); }
function renderInterpretation(row) { $('precision-text').textContent = `${row.source_precision_label}; ${statusText(row.coverage_status)}.`; }
function csvEscape(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function downloadCsv() { const cols = ['area_id', 'area_name', 'area_level', 'period_id', 'alarm_hours', 'school_time_under_alarm_pct', 'affected_school_days', 'available_school_days', 'affected_school_days_pct', 'episodes', 'schools', 'learners', 'source_precision', 'coverage', 'analytical_build_id']; const lines = [cols.join(',')]; for (const r of currentRows) {
    const x = [r.area_id, nameOf(r.area_id), r.area_level, r.period_id, r.alarm_hours_average_school_location, r.school_time_under_alarm_pct, r.affected_school_days_average_school_location, r.available_school_days_average_school_location, affectedDaysPct(r), r.school_time_alarm_episodes_average_school_location, r.school_count, r.learners_total, r.source_precision_label, r.coverage_status, data.release.analytical_build_id];
    lines.push(x.map(csvEscape).join(','));
} const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `aae_${data.release.analytical_build_id}_${state.areaId}_${periodBounds(state).start}_${periodBounds(state).end}.csv`; a.click(); URL.revokeObjectURL(a.href); }
function updateControls() { populatePeriodControls(); $('map-measure').value = state.mapMeasure; $('trend-measure').value = state.trendMeasure; const current = searchItems.find(x => x.id === state.areaId); $('territory-search').value = itemName(current, state.lang); }
async function render() { applyStaticTranslations(); updateControls(); $('fatal-error').hidden = true; const o = parentOblast(state.areaId); const loaded = o ? await ensureHromada(o) : true; const row = rowForState(); if (!row) {
    $('summary-context').textContent = periodHeading();
    $('summary-text').textContent = loaded ? tr('noData') : tr('loadAreaFailed');
    $('aggregation-note').textContent = tr('unavailable');
    renderCards({ area_level: 'hromada', coverage_status: 'unavailable', available_school_seconds_average_school_location: 0, school_time_alarm_episodes_average_school_location: null });
    updateUrl(state);
    return;
} renderSummary(row); renderCards(row); renderEducation(); await renderTime(); await renderMapAndTable(); renderInterpretation(row); updateUrl(state); setTimeout(resizeCharts, 0); }
function dialog(kind) { const content = { alarm: { title: tr('alarmTime'), meaning: state.lang === 'uk' ? 'Унікальний час тривог, що перетинається з припущеним навчальним вікном.' : 'The union of alarm time overlapping the assumed school window.', formula: 'alarm overlap seconds ÷ 3,600; share = alarm overlap seconds ÷ available assumed school seconds × 100', aggregate: tr('averageLocation'), assumption: 'Monday–Friday, configured vacations, 08:00–15:00 Europe/Kyiv.', not: 'Actual lessons cancelled, attendance or learning loss.' }, days: { title: tr('affectedDays'), meaning: state.lang === 'uk' ? 'День враховано, якщо є хоча б один додатний перетин.' : 'A day is counted when any positive overlap occurs.', formula: 'affected school days ÷ available assumed school days × 100', aggregate: tr('averageLocation'), assumption: 'Only available assumed school days enter the denominator.', not: 'Whether teaching stopped for the entire day.' }, episodes: { title: tr('episodes'), meaning: state.lang === 'uk' ? 'Окремі оброблені епізоди з додатним перетином.' : 'Distinct processed episodes with positive overlap.', formula: 'count distinct processed episode IDs with positive school-time overlap', aggregate: tr('averageLocation'), assumption: 'A long episode crossing days is counted once.', not: 'Combined arbitrary-range episodes from summed monthly counts.' } }; const x = content[kind]; $('dialog-title').textContent = x.title; $('dialog-meaning').textContent = x.meaning; $('dialog-formula').textContent = x.formula; $('dialog-aggregate').textContent = x.aggregate; $('dialog-assumption').textContent = x.assumption; $('dialog-not').textContent = x.not; $('indicator-dialog').showModal(); }
function bind() { document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', async () => { state.lang = b.dataset.lang; saveLanguage(state.lang); await setLanguage(state.lang); render(); })); $('period-mode').addEventListener('change', e => { state.periodMode = e.target.value; render(); }); $('school-year').addEventListener('change', e => { state.schoolYear = e.target.value; render(); }); $('month').addEventListener('change', e => { state.month = e.target.value; render(); }); $('range-start').addEventListener('change', e => { state.rangeStart = e.target.value; if (state.rangeStart > state.rangeEnd)
    state.rangeEnd = state.rangeStart; render(); }); $('range-end').addEventListener('change', e => { state.rangeEnd = e.target.value; if (state.rangeEnd < state.rangeStart)
    state.rangeStart = state.rangeEnd; render(); }); $('map-measure').addEventListener('change', e => { state.mapMeasure = e.target.value; renderMapAndTable(); updateUrl(state); }); $('trend-measure').addEventListener('change', e => { state.trendMeasure = e.target.value; renderTime(); updateUrl(state); }); document.querySelectorAll('[data-temporal]').forEach(b => b.addEventListener('click', () => { state.temporalView = b.dataset.temporal; renderTime(); updateUrl(state); })); $('fit-selected').addEventListener('click', () => mapActions?.fitSelected()); $('reset-map').addEventListener('click', () => mapActions?.reset()); $('reset-filters').addEventListener('click', () => { state = defaultState(data.release.available_school_years); render(); }); $('comparison-search').addEventListener('input', renderComparison); $('download-csv').addEventListener('click', downloadCsv); document.querySelectorAll('[data-info]').forEach(b => b.addEventListener('click', () => dialog(b.dataset.info))); window.addEventListener('resize', resizeCharts); setupTerritoryCombobox(); }
async function init() { try {
    data = await loadData();
    searchItems = createSearchItems(data.lookup).filter(x => x.level !== 'hromada' || data.lookup.prototype_hromada_oblasts.includes(x.oblastId));
    fuse = createGeographyFuse(searchItems);
    const parsed = stateFromUrl(data.release.available_school_years, new Set(searchItems.map(x => x.id)));
    state = parsed.state;
    await initI18n(state.lang);
    bind();
    $('loading').hidden = true;
    $('dashboard').hidden = false;
    const releaseMarker = document.querySelector('meta[name="aae-release-id"]')?.content;
    if (releaseMarker !== data.release.website_release_id || document.body.dataset.releaseId !== data.release.website_release_id)
        throw new Error('Release marker mismatch');
    document.documentElement.dataset.releaseId = data.release.website_release_id;
    $('footer-release').textContent = data.release.website_release_id;
    $('footer-build').textContent = ` · ${data.release.analytical_build_id}`;
    if (parsed.corrected) {
        $('parameter-notice').hidden = false;
        $('parameter-notice').textContent = tr('invalidParams');
    }
    await render();
}
catch (e) {
    console.error(e);
    $('loading').hidden = true;
    $('fatal-error').hidden = false;
    $('fatal-error').textContent = `${tr('fatal')} ${e instanceof Error ? e.message : ''}`;
} }
init();
