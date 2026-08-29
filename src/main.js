import { ALL_MONTHS, SCHOOL_YEAR_LABELS, affectedDaysPct, aggregateRange, availabilityReasonKey, buildComparisonCsv, cleanDashboardUrl, coverageDescriptionKey, defaultState, educationContexts, formatDuration, formatNumber, isAnalyticallyUnavailable, mapScopeForArea, monthLabel, periodBounds, periodLabel, saveLanguage, stateFromUrl, updateUrl } from './logic.js';
import { initI18n, setLanguage, tr } from './i18n.js';
import { createGeographyFuse, createSearchItems, itemLabel, itemName, itemParent, searchGeography } from './search.js';
import { renderLeafletMap } from './map.js';
import { heatmapChart, modalityChart, monthlyChart, resizeCharts, schoolYearChart } from './charts.js';
const $ = (id) => document.getElementById(id);
let data, state, searchItems, fuse, mapActions, currentRows = [];
let sortKey = 'school_time_under_alarm_pct', sortDirection = -1;
let lastModalityRows = [];
const PERIOD_MODE_TRANSLATIONS = {
    school_year: 'wholeSchoolYear',
    month: 'month',
    custom_range: 'customRange',
    all_available: 'allAvailable',
};
const TREND_MEASURE_TRANSLATIONS = {
    alarm_hours_average_school_location: 'hours',
    school_time_under_alarm_pct: 'alarmShare',
    affected_school_days_pct: 'daysShare',
};
function normalize(raw) { if (raw.area_level !== 'hromada')
    return raw; return { area_level: 'hromada', area_id: raw.hromada_id, school_year: raw.school_year, period_type: raw.period_type, period_id: raw.period_id, alarm_seconds_average_school_location: raw.alarm_seconds, alarm_hours_average_school_location: raw.alarm_hours, available_school_seconds_average_school_location: raw.available_school_seconds, expected_school_seconds_average_school_location: raw.expected_school_seconds, school_time_under_alarm_pct: raw.school_time_under_alarm_pct, affected_school_days_average_school_location: raw.affected_school_days, available_school_days_average_school_location: raw.available_school_days, expected_school_days_average_school_location: raw.expected_school_days, school_time_alarm_episodes_average_school_location: raw.school_time_alarm_episodes, source_precision_label: raw.source_precision_label, coverage_status: raw.coverage_status, school_count: raw.school_count, comparable_school_count: raw.comparable_school_count, learners_total: raw.learners_total, learners_offline: raw.learners_offline, learners_online: raw.learners_online, learners_mixed: raw.learners_mixed, education_snapshot_date: raw.education_snapshot_date }; }
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
        status.hidden = true;
        return true;
    }
    catch (error) {
        console.error(error);
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
function sourcePrecisionText(value) { const keys = { hromada: 'sourcePrecisionHromada', mixed: 'sourcePrecisionMixed', 'not applicable': 'sourcePrecisionNotApplicable', 'oblast allocation': 'sourcePrecisionOblast', 'raion allocation': 'sourcePrecisionRaion' }; return keys[value] ? tr(keys[value]) : tr('unavailable'); }
function trendMeasureLabel() { return tr(TREND_MEASURE_TRANSLATIONS[state.trendMeasure]); }
async function selectArea(id) { state.areaId = id; const oblastId = parentOblast(id); if (oblastId)
    await ensureHromada(oblastId); updateUrl(state); await render(); }
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
function statusText(x) { return x === 'complete' ? tr('complete') : x === 'partial' ? tr('partial') : x === 'not_covered' ? tr('notCovered') : tr('unavailable'); }
function updateDataDisclosures() {
    document.querySelectorAll('.data-details').forEach(details => {
        const summary = details.querySelector('.data-disclosure-summary');
        if (summary)
            summary.textContent = tr(details.open ? 'hideDataTable' : 'showDataTable');
    });
}
function applyStaticTranslations() {
    document.querySelectorAll('[data-t]').forEach(el => { el.textContent = tr(el.dataset.t); });
    document.querySelectorAll('[data-t-placeholder]').forEach(el => { el.placeholder = tr(el.dataset.tPlaceholder); });
    document.querySelectorAll('[data-t-aria-label]').forEach(el => { el.setAttribute('aria-label', tr(el.dataset.tAriaLabel)); });
    document.title = tr('appTitle');
    $('page-title').textContent = tr('appTitle');
    $('page-title').href = cleanDashboardUrl(state.lang);
    $('page-subtitle').textContent = tr('subtitle');
    document.querySelectorAll('[data-lang]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.lang === state.lang)));
    document.querySelectorAll('[data-footer-org-lang]').forEach(group => { group.hidden = group.dataset.footerOrgLang !== state.lang; });
    const params = `?lang=${state.lang}`;
    document.querySelectorAll('[data-page]').forEach(anchor => { anchor.href = `./${anchor.dataset.page}.html${params}`; });
    updateDataDisclosures();
}
function option(value, label) { const o = document.createElement('option'); o.value = value; o.textContent = label; return o; }
function populatePeriodControls() {
    const mode = $('period-mode');
    if (!mode.options.length) {
        Object.entries(PERIOD_MODE_TRANSLATIONS).forEach(([value, key]) => mode.append(option(value, tr(key))));
    }
    else {
        [...mode.options].forEach(item => { item.textContent = tr(PERIOD_MODE_TRANSLATIONS[item.value]); });
    }
    mode.value = state.periodMode;

    const schoolYear = $('school-year');
    schoolYear.replaceChildren(...data.release.available_school_years.map(year => option(year, SCHOOL_YEAR_LABELS[year])));
    schoolYear.value = state.schoolYear;

    const month = $('month');
    month.replaceChildren(...ALL_MONTHS.map(period => option(period, monthLabel(period, state.lang))));
    month.value = state.month;

    for (const id of ['range-start', 'range-end']) {
        const control = $(id);
        control.replaceChildren(...ALL_MONTHS.map(period => option(period, `${monthLabel(period, state.lang)} · ${SCHOOL_YEAR_LABELS[schoolYearForMonthSafe(period)]}`)));
        control.value = id === 'range-start' ? state.rangeStart : state.rangeEnd;
    }

    $('school-year-field').hidden = state.periodMode !== 'school_year';
    $('month-field').hidden = state.periodMode !== 'month';
    $('range-fields').hidden = state.periodMode !== 'custom_range';
    $('all-period-note').hidden = state.periodMode !== 'all_available';
}
function schoolYearForMonthSafe(m) { const [y, n] = m.split('-').map(Number); return n >= 9 ? `${y}_${y + 1}` : `${y - 1}_${y}`; }
function renderSearchResults(query = '', preserveInput = false) { const box = $('territory-results'); const selected = searchItems.find(x => x.id === state.areaId); if (!preserveInput)
    $('territory-search').value = query || itemName(selected, state.lang); const results = searchGeography(fuse, searchItems, query, 12); box.replaceChildren(); $('territory-result-count').textContent = String(results.length); if (!results.length) {
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
    const choose = async () => { box.hidden = true; await selectArea(x.id); };
    b.addEventListener('click', choose);
    b.addEventListener('keydown', async event => {
        if (event.key !== 'Enter' && event.key !== ' ')
            return;
        event.preventDefault();
        await choose();
    });
    li.append(b);
    box.append(li);
} }
function setupTerritoryCombobox() { const input = $('territory-search'), box = $('territory-results'); input.placeholder = tr('territoryHint'); input.addEventListener('focus', () => { box.hidden = false; renderSearchResults(input.value === itemName(searchItems.find(x => x.id === state.areaId), state.lang) ? '' : input.value); }); input.addEventListener('input', () => { box.hidden = false; renderSearchResults(input.value, true); }); input.addEventListener('keydown', e => { const buttons = [...box.querySelectorAll('button')]; if (e.key === 'ArrowDown') {
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
function insightPeriodClause() {
    const bounds = periodBounds(state);
    const start = monthLabel(bounds.start, state.lang);
    const end = monthLabel(bounds.end, state.lang);
    if (state.periodMode === 'school_year')
        return state.lang === 'uk'
            ? `У ${SCHOOL_YEAR_LABELS[state.schoolYear]} навчальному році`
            : `In the ${SCHOOL_YEAR_LABELS[state.schoolYear]} school year`;
    if (state.periodMode === 'month')
        return state.lang === 'uk' ? `У вибраному місяці (${start})` : `In the selected month (${start})`;
    if (state.periodMode === 'all_available')
        return state.lang === 'uk'
            ? `За весь доступний період (${start} — ${end})`
            : `Across the full available period (${start}–${end})`;
    return state.lang === 'uk'
        ? `За вибраний період (${start} — ${end})`
        : `Across the selected period (${start}–${end})`;
}
function renderHromadaNavigation() {
    const navigation = $('hromada-navigation');
    const button = $('back-to-oblast');
    const hromada = data.lookup.hromadas[state.areaId];
    if (!hromada) {
        navigation.hidden = true;
        button.textContent = '';
        return;
    }
    navigation.hidden = false;
    button.textContent = tr('backToOblast', { oblast: nameOf(hromada.oblast_id) });
}
function renderSummary(row) {
    $('summary-context').textContent = periodHeading();
    const periodClause = insightPeriodClause();
    const area = nameOf(row.area_id);
    if (isAnalyticallyUnavailable(row)) {
        const notCovered = row.coverage_status === 'not_covered';
        $('summary-text').textContent = notCovered
            ? state.lang === 'uk'
                ? `Для території «${area}» у межах цієї методології немає порівнюваного охоплення джерелом тривог.`
                : `Comparable alarm-source coverage is not available for ${area} under this methodology.`
            : state.lang === 'uk'
                ? `Для території «${area}» та цього періоду неможливо розрахувати результат із доступних даних.`
                : `A result cannot be calculated for ${area} and this period from the available data.`;
        $('aggregation-note').textContent = tr(notCovered ? 'notCovered' : 'unavailable');
        return;
    }
    const aggregate = row.area_level !== 'hromada';
    const digits = aggregate ? 1 : 0;
    const pct = formatNumber(row.school_time_under_alarm_pct, state.lang, 1);
    const hours = formatDuration(row.alarm_hours_average_school_location, state.lang);
    const days = formatNumber(row.affected_school_days_average_school_location, state.lang, digits);
    const denominator = formatNumber(row.available_school_days_average_school_location, state.lang, digits);
    if (state.lang === 'uk') {
        $('summary-text').textContent = aggregate
            ? `${periodClause} зафіксовані повітряні тривоги перетиналися з розрахунковим навчальним часом у середньому протягом ${hours} на одне активне місце розташування закладу освіти з порівнюваним охопленням джерелом тривог на території «${area}». Це становить ${pct}% розрахункового навчального часу, охопленого джерелом. У середньому в ${days} із ${denominator} розрахункових навчальних днів був принаймні один перетин із тривогою.`
            : `${periodClause} на території «${area}» зафіксовані повітряні тривоги перетиналися з розрахунковим навчальним часом протягом ${hours}. Це становить ${pct}% розрахункового навчального часу, охопленого джерелом. У ${days} із ${denominator} розрахункових навчальних днів був принаймні один перетин із тривогою.`;
    }
    else {
        $('summary-text').textContent = aggregate
            ? `${periodClause}, recorded air alarms overlapped with ${hours} of modelled school time on average per active school location with comparable alarm-source coverage in ${area}, equal to ${pct}% of modelled school time with source coverage. An average of ${days} of ${denominator} modelled school days had at least one alarm overlap.`
            : `${periodClause}, recorded air alarms in ${area} overlapped with ${hours} of modelled school time, equal to ${pct}% of modelled school time with source coverage. ${days} of ${denominator} modelled school days had at least one alarm overlap.`;
    }
    $('aggregation-note').textContent = aggregate ? tr('aggregateMetricContext') : tr('hromadaMetricContext');
}
function setHeadlineMetric(element, text, label, reason = null) {
    element.textContent = text;
    element.classList.toggle('has-availability-reason', Boolean(reason));
    element.removeAttribute('title');
    if (reason) {
        element.dataset.availabilityReason = reason;
        element.tabIndex = 0;
        element.setAttribute('aria-label', `${label}: ${reason}`);
    }
    else {
        delete element.dataset.availabilityReason;
        element.removeAttribute('tabindex');
        element.removeAttribute('aria-label');
    }
}
function renderCards(row) {
    const unavailable = isAnalyticallyUnavailable(row);
    const reasonKey = availabilityReasonKey(row);
    const unavailableText = reasonKey ? tr(reasonKey) : null;
    const aggregate = row.area_level !== 'hromada';
    const digits = aggregate ? 1 : 0;
    const context = aggregate ? tr('averageLocation') : tr('directResult');
    setHeadlineMetric($('alarm-time-value'), formatDuration(unavailable ? null : row.alarm_hours_average_school_location, state.lang), tr('alarmTime'), unavailableText);
    setHeadlineMetric($('alarm-time-secondary'), unavailable ? '—' : `${formatNumber(row.school_time_under_alarm_pct, state.lang, 1)}%`, tr('alarmShare'), unavailableText);
    $('alarm-time-context').textContent = unavailable ? '' : context;
    $('affected-days-value').textContent = unavailable ? '—' : `${formatNumber(row.affected_school_days_average_school_location, state.lang, digits)} / ${formatNumber(row.available_school_days_average_school_location, state.lang, digits)}`;
    $('affected-days-value').setAttribute('aria-label', `${tr('affectedDays')}: ${$('affected-days-value').textContent}`);
    setHeadlineMetric($('affected-days-secondary'), unavailable ? '—' : `${formatNumber(affectedDaysPct(row), state.lang, 1)}%`, tr('daysShare'), unavailableText);
    $('affected-days-context').textContent = unavailable ? '' : context;
    const episodes = unavailable ? null : row.school_time_alarm_episodes_average_school_location;
    const episodeReason = unavailable ? unavailableText : episodes === null ? tr('noEpisodesRange') : null;
    setHeadlineMetric($('episodes-value'), episodes === null ? '—' : formatNumber(episodes, state.lang, digits), tr('episodes'), episodeReason);
    $('episodes-secondary').textContent = unavailable ? '' : episodes === null ? tr('noEpisodesRange') : '';
    $('episodes-context').textContent = unavailable || episodes === null ? '' : tr(aggregate ? 'episodesAggregateContext' : 'episodesHromadaContext');
}
function drawModalityChart() {
    if (!lastModalityRows.length)
        return;
    modalityChart($('modality-chart'), lastModalityRows, state.lang, {
        offline: tr('offline'),
        online: tr('online'),
        mixed: tr('mixed'),
        other: tr('other'),
    });
}
function renderEducation() {
    const contexts = periodContext().filter(context => context.row && Number.isFinite(context.row.learners_total) && context.row.education_snapshot_date);
    const multi = contexts.length > 1;
    const summary = $('education-summary');
    const yearRowsElement = $('education-years');
    const empty = $('education-empty');
    const modalityPanel = $('modality-panel');
    summary.replaceChildren();
    yearRowsElement.replaceChildren();
    lastModalityRows = contexts.map(context => context.row);
    if (!contexts.length) {
        $('education-multi-note').hidden = true;
        empty.hidden = false;
        empty.textContent = tr('educationUnavailable');
        modalityPanel.hidden = true;
        $('education-note').textContent = tr('contextCaveat');
        return;
    }
    empty.hidden = true;
    modalityPanel.hidden = false;
    const dateFormatter = new Intl.DateTimeFormat(state.lang === 'uk' ? 'uk-UA' : 'en-GB', { dateStyle: 'long', timeZone: 'UTC' });
    if (!multi) {
        const context = contexts[0];
        summary.innerHTML = `<div><span>${tr('schools')}</span><strong>${formatNumber(context.row.school_count, state.lang)}</strong></div><div><span>${tr('learners')}</span><strong>${formatNumber(context.row.learners_total, state.lang)}</strong></div><small>${tr('snapshot')} ${dateFormatter.format(new Date(context.row.education_snapshot_date + 'T00:00:00Z'))}</small>`;
    }
    else {
        for (const context of contexts) {
            const row = document.createElement('div');
            row.className = 'education-year-row';
            row.innerHTML = `<strong>${SCHOOL_YEAR_LABELS[context.schoolYear]}</strong><span>${tr('schools')}: ${formatNumber(context.row.school_count, state.lang)}</span><span>${tr('learners')}: ${formatNumber(context.row.learners_total, state.lang)}</span><small>${dateFormatter.format(new Date(context.row.education_snapshot_date + 'T00:00:00Z'))}</small>`;
            yearRowsElement.append(row);
        }
    }
    $('education-multi-note').hidden = !multi;
    $('education-multi-note').textContent = multi ? tr('multiYearContext') : '';
    const notes = [tr('contextCaveat')];
    if (contexts.some(context => context.schoolYear === '2022_2023'))
        notes.push(tr('modality2022'));
    if (contexts.some(context => context.schoolYear !== '2022_2023'))
        notes.push(tr('modalityLater'));
    $('education-note').textContent = notes.join(' ');
    drawModalityChart();
}
function renderChartTable(el, rows, labelKey) {
    const measures = [
        ['alarm_hours_average_school_location', 'hours'],
        ['school_time_under_alarm_pct', 'alarmShare'],
        ['affected_school_days_pct', 'daysShare'],
    ];
    const table = document.createElement('table');
    const caption = document.createElement('caption');
    caption.textContent = `${tr('dataTable')} · ${trendMeasureLabel()}`;
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    const periodHead = document.createElement('th');
    periodHead.scope = 'col';
    periodHead.textContent = labelKey === 'period_id' ? tr('month') : tr('schoolYear');
    headRow.append(periodHead);
    for (const [measure, translation] of measures) {
        const heading = document.createElement('th');
        heading.scope = 'col';
        heading.textContent = tr(translation);
        if (measure === state.trendMeasure) {
            heading.className = 'selected-measure';
            heading.setAttribute('aria-current', 'true');
        }
        headRow.append(heading);
    }
    head.append(headRow);
    const body = document.createElement('tbody');
    for (const row of rows) {
        const tableRow = document.createElement('tr');
        const label = labelKey === 'period_id' ? monthLabel(row.period_id, state.lang) : SCHOOL_YEAR_LABELS[row.school_year];
        const rowHead = document.createElement('th');
        rowHead.scope = 'row';
        rowHead.textContent = label;
        tableRow.append(rowHead);
        for (const [measure] of measures) {
            const cell = document.createElement('td');
            const raw = value(row, measure);
            cell.textContent = measure === 'alarm_hours_average_school_location'
                ? formatDuration(raw, state.lang)
                : raw === null ? '—' : `${formatNumber(raw, state.lang, 1)}%`;
            if (measure === state.trendMeasure)
                cell.className = 'selected-measure';
            tableRow.append(cell);
        }
        body.append(tableRow);
    }
    table.append(caption, head, body);
    el.replaceChildren(table);
}
async function renderTime() {
    const monthly = monthlyRows();
    const yearly = yearRows();
    const measureLabel = trendMeasureLabel();
    document.querySelectorAll('[data-temporal]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.temporal === state.temporalView)));
    $('monthly-panel').hidden = state.temporalView !== 'monthly';
    $('year-panel').hidden = state.temporalView !== 'school_years';
    $('heatmap-panel').hidden = state.temporalView !== 'heatmap';
    $('chart-error').hidden = true;
    renderChartTable($('monthly-data'), monthly, 'period_id');
    renderChartTable($('year-data'), yearly, 'school_year');
    renderChartTable($('heatmap-data'), monthly, 'period_id');
    try {
        if (state.temporalView === 'monthly') {
            monthlyChart($('monthly-chart'), monthly, state.trendMeasure, measureLabel, state.lang, id => {
                state.periodMode = 'month';
                state.month = id;
                updateUrl(state);
                render();
            });
        }
        if (state.temporalView === 'school_years')
            schoolYearChart($('year-chart'), yearly, state.trendMeasure, measureLabel, state.lang);
        if (state.temporalView === 'heatmap')
            heatmapChart($('heatmap-chart'), monthly, state.trendMeasure, measureLabel, state.lang);
    }
    catch (error) {
        console.error(error);
        $('chart-error').hidden = false;
        $('chart-error').textContent = tr('chartUnavailable');
    }
}
async function renderMapAndTable() { const scope = mapScopeForArea(state.areaId, data.lookup), oblastId = scope.oblastId, atHromada = scope.level === 'hromada'; $('map-action-status').textContent = ''; $('csv-status').textContent = ''; if (atHromada && !(await ensureHromada(oblastId))) {
    currentRows = [];
    renderComparison();
    mapActions = null;
    $('fit-selected').disabled = true;
    $('map-error').hidden = false;
    $('map-error').textContent = tr('loadAreaFailed');
    return;
} const rows = periodRowsForComparison(atHromada ? oblastId : undefined), geo = atHromada ? data.hromadaGeo[oblastId] : data.oblastGeo, selected = data.lookup.hromadas[state.areaId] ? state.areaId : ''; currentRows = rows; renderComparison(); const geometryUnavailable = data.lookup.hromadas[state.areaId]?.geometry_status !== undefined && data.lookup.hromadas[state.areaId]?.geometry_status !== 'available'; $('map-error').hidden = !geometryUnavailable; if (geometryUnavailable)
    $('map-error').textContent = tr('geometryUnavailable'); try {
    mapActions = renderLeafletMap($('map-container'), $('map-legend'), geo, rows, state.mapMeasure, tr(TREND_MEASURE_TRANSLATIONS[state.mapMeasure]), state.lang, selected, id => { selectArea(id); }, () => { $('map-action-status').textContent = tr('mapResetSuccess'); });
    $('fit-selected').disabled = false;
}
catch (e) {
    console.error(e);
    mapActions = null;
    $('fit-selected').disabled = true;
    $('map-error').hidden = false;
    $('map-error').textContent = tr('mapUnavailable');
} }
function appendDefinition(list, label, shown) {
    const item = document.createElement('div');
    const term = document.createElement('dt');
    const valueElement = document.createElement('dd');
    term.textContent = label;
    valueElement.textContent = shown;
    item.append(term, valueElement);
    list.append(item);
}
let activeSourceInfoTrigger = null;
function sourceInfoTooltip() {
    let tooltip = document.getElementById('source-info-tooltip');
    if (tooltip)
        return tooltip;
    tooltip = document.createElement('div');
    tooltip.id = 'source-info-tooltip';
    tooltip.className = 'source-info-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.hidden = true;
    document.body.append(tooltip);
    return tooltip;
}
function positionSourceInfoTooltip(trigger, tooltip) {
    const margin = 8;
    const gap = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const left = Math.min(
        window.innerWidth - tooltipRect.width - margin,
        Math.max(margin, triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2),
    );
    const preferredTop = triggerRect.top - tooltipRect.height - gap;
    const desiredTop = preferredTop >= margin ? preferredTop : triggerRect.bottom + gap;
    const top = Math.min(
        Math.max(margin, window.innerHeight - tooltipRect.height - margin),
        Math.max(margin, desiredTop),
    );
    tooltip.style.left = `${Math.max(margin, left)}px`;
    tooltip.style.top = `${Math.max(margin, top)}px`;
}
function hideSourceInfoTooltip(trigger = activeSourceInfoTrigger) {
    if (!activeSourceInfoTrigger || trigger !== activeSourceInfoTrigger)
        return;
    const tooltip = sourceInfoTooltip();
    tooltip.hidden = true;
    tooltip.replaceChildren();
    activeSourceInfoTrigger.removeAttribute('aria-describedby');
    activeSourceInfoTrigger = null;
}
function showSourceInfoTooltip(trigger, row) {
    if (activeSourceInfoTrigger && activeSourceInfoTrigger !== trigger)
        hideSourceInfoTooltip(activeSourceInfoTrigger);
    const tooltip = sourceInfoTooltip();
    const list = document.createElement('dl');
    appendDefinition(list, tr('precision'), sourcePrecisionText(row.source_precision_label));
    appendDefinition(list, tr('coverage'), statusText(row.coverage_status));
    tooltip.replaceChildren(list);
    tooltip.hidden = false;
    tooltip.style.visibility = 'hidden';
    activeSourceInfoTrigger = trigger;
    trigger.setAttribute('aria-describedby', tooltip.id);
    positionSourceInfoTooltip(trigger, tooltip);
    tooltip.style.visibility = '';
}
function bindSourceInfoTrigger(trigger, row) {
    let hovered = false;
    let focused = false;
    trigger.classList.add('source-info-trigger');
    trigger.setAttribute('aria-label', `${tr('sourceDetails')}: ${nameOf(row.area_id)}`);
    trigger.addEventListener('pointerenter', () => {
        hovered = true;
        showSourceInfoTooltip(trigger, row);
    });
    trigger.addEventListener('pointerleave', () => {
        hovered = false;
        if (!focused)
            hideSourceInfoTooltip(trigger);
    });
    trigger.addEventListener('focus', () => {
        focused = true;
        showSourceInfoTooltip(trigger, row);
    });
    trigger.addEventListener('blur', () => {
        focused = false;
        if (!hovered)
            hideSourceInfoTooltip(trigger);
    });
    trigger.addEventListener('pointerdown', event => event.stopPropagation());
    trigger.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        trigger.focus({ preventScroll: true });
    });
    trigger.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            hideSourceInfoTooltip(trigger);
            trigger.blur();
        }
    });
    return trigger;
}
function repositionActiveSourceInfoTooltip() {
    if (!activeSourceInfoTrigger)
        return;
    if (!activeSourceInfoTrigger.isConnected) {
        hideSourceInfoTooltip(activeSourceInfoTrigger);
        return;
    }
    const tooltip = sourceInfoTooltip();
    if (!tooltip.hidden)
        positionSourceInfoTooltip(activeSourceInfoTrigger, tooltip);
}
window.addEventListener('resize', repositionActiveSourceInfoTooltip);
window.addEventListener('scroll', repositionActiveSourceInfoTooltip, true);
function comparisonSourceInfoTrigger(row) {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    if (row.coverage_status === 'complete') {
        trigger.className = 'source-info-icon';
        trigger.textContent = 'i';
    }
    else {
        trigger.className = `status-badge status-${row.coverage_status}`;
        trigger.textContent = statusText(row.coverage_status);
    }
    return bindSourceInfoTrigger(trigger, row);
}
function renderComparison() {
    hideSourceInfoTooltip();
    const query = $('comparison-search').value.trim();
    let rows = currentRows;
    if (query) {
        const matchingIds = new Set(fuse.search(query, { limit: 300 }).map(result => result.item.id));
        rows = rows.filter(row => matchingIds.has(row.area_id));
    }
    rows = [...rows].sort((a, b) => {
        if (sortKey === 'area_name')
            return nameOf(a.area_id).localeCompare(nameOf(b.area_id), state.lang === 'uk' ? 'uk' : 'en') * sortDirection;
        const first = value(a, sortKey);
        const second = value(b, sortKey);
        if (first === null && second === null)
            return 0;
        if (first === null)
            return 1;
        if (second === null)
            return -1;
        return (first - second) * sortDirection;
    });

    $('comparison-result-count').textContent = tr('areasShown', { count: rows.length });
    const desktop = $('comparison-table');
    const mobile = $('comparison-cards');
    desktop.replaceChildren();
    mobile.replaceChildren();

    const table = document.createElement('table');
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    const columns = [
        ['area_name', 'area'],
        ['school_time_under_alarm_pct', 'share'],
        ['alarm_hours_average_school_location', 'hours'],
        ['affected_school_days_pct', 'days'],
    ];
    for (const [key, translation] of columns) {
        const heading = document.createElement('th');
        heading.scope = 'col';
        const button = document.createElement('button');
        const active = sortKey === key;
        const arrow = active ? (sortDirection === -1 ? ' ↓' : ' ↑') : '';
        button.type = 'button';
        button.dataset.sort = key;
        button.textContent = `${tr(translation)}${arrow}`;
        button.title = active ? tr(sortDirection === -1 ? 'sortDescending' : 'sortAscending') : '';
        heading.setAttribute('aria-sort', active ? (sortDirection === -1 ? 'descending' : 'ascending') : 'none');
        heading.append(button);
        headRow.append(heading);
    }
    head.append(headRow);
    const body = document.createElement('tbody');

    if (!rows.length) {
        const emptyRow = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = columns.length;
        cell.textContent = tr('tableNoResults');
        emptyRow.append(cell);
        body.append(emptyRow);
        const mobileEmpty = document.createElement('p');
        mobileEmpty.className = 'notice';
        mobileEmpty.textContent = tr('tableNoResults');
        mobile.append(mobileEmpty);
    }

    for (const row of rows) {
        const unavailable = isAnalyticallyUnavailable(row);
        const display = {
            area: nameOf(row.area_id),
            share: unavailable ? '—' : `${formatNumber(row.school_time_under_alarm_pct, state.lang, 1)}%`,
            hours: formatDuration(unavailable ? null : row.alarm_hours_average_school_location, state.lang),
            days: unavailable ? '—' : `${formatNumber(affectedDaysPct(row), state.lang, 1)}%`,
        };
        const tableRow = document.createElement('tr');
        if (row.area_id === state.areaId)
            tableRow.className = 'current-row';
        const rowHeading = document.createElement('th');
        rowHeading.scope = 'row';
        const areaLine = document.createElement('div');
        areaLine.className = 'territory-cell-main';
        const areaButton = document.createElement('button');
        areaButton.type = 'button';
        areaButton.textContent = display.area;
        areaButton.setAttribute('aria-label', `${tr('selectArea')}: ${display.area}`);
        if (row.area_id === state.areaId)
            areaButton.setAttribute('aria-current', 'true');
        areaButton.addEventListener('click', () => { selectArea(row.area_id); });
        areaLine.append(areaButton);
        areaLine.append(comparisonSourceInfoTrigger(row));
        rowHeading.append(areaLine);
        tableRow.append(rowHeading);
        for (const shown of [display.share, display.hours, display.days]) {
            const cell = document.createElement('td');
            cell.textContent = shown;
            tableRow.append(cell);
        }
        body.append(tableRow);

        const card = document.createElement('details');
        card.className = 'comparison-card';
        if (row.area_id === state.areaId)
            card.classList.add('current-card');
        const cardSummary = document.createElement('summary');
        const cardTitle = document.createElement('span');
        cardTitle.className = 'comparison-card-title';
        const cardArea = document.createElement('strong');
        cardArea.textContent = display.area;
        cardTitle.append(cardArea, comparisonSourceInfoTrigger(row));
        const cardShare = document.createElement('span');
        cardShare.className = 'comparison-card-share';
        cardShare.textContent = display.share;
        const cardSecondary = document.createElement('small');
        cardSecondary.textContent = `${display.hours} · ${display.days}`;
        cardSummary.append(cardTitle, cardShare, cardSecondary);
        const metrics = document.createElement('dl');
        metrics.className = 'comparison-card-metrics';
        appendDefinition(metrics, tr('episodes'), unavailable || row.school_time_alarm_episodes_average_school_location === null ? '—' : formatNumber(row.school_time_alarm_episodes_average_school_location, state.lang, row.area_level === 'hromada' ? 0 : 1));
        appendDefinition(metrics, tr('schools'), formatNumber(row.school_count, state.lang));
        appendDefinition(metrics, tr('learners'), formatNumber(row.learners_total, state.lang));
        const selectButton = document.createElement('button');
        selectButton.type = 'button';
        selectButton.className = 'button-secondary comparison-select';
        selectButton.textContent = row.area_id === state.areaId ? tr('currentArea') : tr('selectArea');
        selectButton.disabled = row.area_id === state.areaId;
        selectButton.addEventListener('click', () => { selectArea(row.area_id); });
        card.append(cardSummary, metrics, selectButton);
        mobile.append(card);
    }

    table.append(head, body);
    desktop.append(table);
    desktop.querySelectorAll('[data-sort]').forEach(button => button.addEventListener('click', () => {
        const key = button.dataset.sort;
        if (sortKey === key)
            sortDirection *= -1;
        else {
            sortKey = key;
            sortDirection = key === 'area_name' ? 1 : -1;
        }
        renderComparison();
    }));
}
function renderInterpretation(row) {
    const sourceKeys = {
        hromada: 'sourceDescriptionHromada',
        'raion allocation': 'sourceDescriptionRaion',
        'oblast allocation': 'sourceDescriptionOblast',
        mixed: 'sourceDescriptionMixed',
        'not applicable': 'sourcePrecisionNotApplicable',
    };
    const details = [];
    const sourceKey = sourceKeys[row.source_precision_label];
    if (sourceKey) {
        const sourceText = tr(sourceKey);
        details.push(/[.!?…]$/.test(sourceText) ? sourceText : `${sourceText}.`);
    }
    const coverageKey = coverageDescriptionKey(row);
    if (coverageKey)
        details.push(tr(coverageKey));
    $('precision-text').textContent = details.join(' ');
}
function downloadCsv() { const csv = buildComparisonCsv(currentRows, id => nameOf(id), data.release.analytical_build_id, statusText); const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a'); const objectUrl = URL.createObjectURL(blob); a.href = objectUrl; a.download = `aae_${data.release.analytical_build_id}_${state.areaId}_${periodBounds(state).start}_${periodBounds(state).end}.csv`; a.hidden = true; document.body.append(a); a.click(); a.remove(); $('csv-status').textContent = tr('csvPrepared', { count: currentRows.length }); setTimeout(() => URL.revokeObjectURL(objectUrl), 0); }
function updateControls() {
    populatePeriodControls();
    $('map-measure').value = state.mapMeasure;
    $('map-measure').title = tr(TREND_MEASURE_TRANSLATIONS[state.mapMeasure]);
    $('trend-measure').value = state.trendMeasure;
    $('trend-measure').title = tr(TREND_MEASURE_TRANSLATIONS[state.trendMeasure]);
    const current = searchItems.find(x => x.id === state.areaId);
    $('territory-search').value = itemName(current, state.lang);
}
async function render() {
    applyStaticTranslations();
    updateControls();
    renderHromadaNavigation();
    $('fatal-error').hidden = true;
    const oblastId = parentOblast(state.areaId);
    const loaded = oblastId ? await ensureHromada(oblastId) : true;
    const row = rowForState();
    renderEducation();
    if (!row) {
        $('summary-context').textContent = periodHeading();
        $('summary-text').textContent = loaded ? tr('noData') : tr('loadAreaFailed');
        $('aggregation-note').textContent = tr('unavailable');
        renderCards({
            area_level: data.lookup.hromadas[state.areaId] ? 'hromada' : data.lookup.oblasts[state.areaId] ? 'oblast' : 'national',
            coverage_status: 'unavailable',
            available_school_seconds_average_school_location: 0,
            school_time_alarm_episodes_average_school_location: null,
        });
        $('precision-text').textContent = tr('unavailable');
    }
    else {
        renderSummary(row);
        renderCards(row);
        renderInterpretation(row);
    }
    await renderTime();
    await renderMapAndTable();
    updateUrl(state);
    setTimeout(resizeCharts, 0);
}
function dialog(kind) {
    const content = {
        alarm: { title: tr('alarmTime'), meaning: tr('alarmMeaning'), formula: tr('alarmFormula'), not: tr('alarmNot') },
        share: { title: tr('alarmShare'), meaning: tr('shareMeaning'), formula: tr('shareFormula'), not: tr('shareNot') },
        days: { title: tr('daysShare'), meaning: tr('daysMeaning'), formula: tr('daysFormula'), not: tr('daysNot') },
        episodes: { title: tr('episodes'), meaning: tr('episodesMeaning'), formula: tr('episodesFormula'), not: tr('episodesNot') },
    };
    const selected = content[kind];
    $('dialog-title').textContent = selected.title;
    $('dialog-meaning').textContent = selected.meaning;
    $('dialog-formula').textContent = selected.formula;
    $('dialog-aggregate').textContent = data.lookup.hromadas[state.areaId] ? tr('hromadaMetricContext') : tr('aggregateMetricContext');
    $('dialog-assumption').textContent = tr('modelledHoursDefinition');
    $('dialog-not').textContent = selected.not;
    $('indicator-dialog').showModal();
}
async function switchLanguage(lang, button) {
    if (lang === state.lang)
        return;
    const viewport = { x: window.scrollX, y: window.scrollY };
    state.lang = lang;
    saveLanguage(lang);
    await setLanguage(lang);
    await render();
    await new Promise(resolve => requestAnimationFrame(resolve));
    window.scrollTo({ left: viewport.x, top: viewport.y, behavior: 'auto' });
    button.focus({ preventScroll: true });
    await new Promise(resolve => requestAnimationFrame(resolve));
    window.scrollTo({ left: viewport.x, top: viewport.y, behavior: 'auto' });
}
function bind() {
    document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => { switchLanguage(button.dataset.lang, button); }));
    $('period-mode').addEventListener('change', event => { state.periodMode = event.target.value; render(); });
    $('school-year').addEventListener('change', event => { state.schoolYear = event.target.value; render(); });
    $('month').addEventListener('change', event => { state.month = event.target.value; render(); });
    $('range-start').addEventListener('change', event => { state.rangeStart = event.target.value; if (state.rangeStart > state.rangeEnd)
        state.rangeEnd = state.rangeStart; render(); });
    $('range-end').addEventListener('change', event => { state.rangeEnd = event.target.value; if (state.rangeEnd < state.rangeStart)
        state.rangeStart = state.rangeEnd; render(); });
    $('map-measure').addEventListener('change', event => { state.mapMeasure = event.target.value; renderMapAndTable(); updateUrl(state); });
    $('trend-measure').addEventListener('change', event => { state.trendMeasure = event.target.value; renderTime(); updateUrl(state); });
    document.querySelectorAll('[data-temporal]').forEach(button => button.addEventListener('click', () => { state.temporalView = button.dataset.temporal; renderTime(); updateUrl(state); }));
    $('fit-selected').addEventListener('click', () => {
        if (!mapActions)
            return;
        $('map-action-status').textContent = mapActions.fitSelected() ? tr('mapFitSuccess') : tr('mapFitUnavailable');
    });
    $('back-to-oblast').addEventListener('click', () => { const oblastId = parentOblast(state.areaId); if (oblastId)
        selectArea(oblastId); });
    document.querySelectorAll('.data-details').forEach(details => details.addEventListener('toggle', updateDataDisclosures));
    $('reset-filters').addEventListener('click', () => {
        const lang = state.lang;
        state = defaultState(data.release.available_school_years);
        state.lang = lang;
        sortKey = 'school_time_under_alarm_pct';
        sortDirection = -1;
        $('comparison-search').value = '';
        render();
    });
    $('comparison-search').addEventListener('input', renderComparison);
    $('download-csv').addEventListener('click', downloadCsv);
    document.querySelectorAll('[data-info]').forEach(button => button.addEventListener('click', () => dialog(button.dataset.info)));
    window.addEventListener('resize', resizeCharts);
    setupTerritoryCombobox();
}
async function init() { try {
    const requestedLanguage = new URLSearchParams(location.search).get('lang');
    await initI18n(requestedLanguage === 'en' ? 'en' : 'uk');
    data = await loadData();
    searchItems = createSearchItems(data.lookup).filter(x => x.level !== 'hromada' || data.lookup.prototype_hromada_oblasts.includes(x.oblastId));
    fuse = createGeographyFuse(searchItems);
    const parsed = stateFromUrl(data.release.available_school_years, new Set(searchItems.map(x => x.id)));
    state = parsed.state;
    await setLanguage(state.lang);
    const releaseMarker = document.querySelector('meta[name="aae-release-id"]')?.content;
    if (releaseMarker !== data.release.website_release_id || document.body.dataset.releaseId !== data.release.website_release_id)
        throw new Error(tr('releaseMismatch'));
    bind();
    $('loading').hidden = true;
    $('dashboard').hidden = false;
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
    $('fatal-error').textContent = `${tr('fatal')} ${tr('fatalHelp')}`;
} }
init();
