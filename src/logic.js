export const SCHOOL_YEAR_LABELS = { '2022_2023': '2022/23', '2023_2024': '2023/24', '2024_2025': '2024/25', '2025_2026': '2025/26' };
export const ALL_MONTHS = ['2022-09', '2022-10', '2022-11', '2022-12', '2023-01', '2023-02', '2023-03', '2023-04', '2023-05', '2023-06', '2023-09', '2023-10', '2023-11', '2023-12', '2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06', '2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
export function monthsForSchoolYear(schoolYear) { return ALL_MONTHS.filter(m => schoolYearForMonth(m) === schoolYear); }
export function schoolYearForMonth(month) { const [y, m] = month.split('-').map(Number); return m >= 9 ? `${y}_${y + 1}` : `${y - 1}_${y}`; }
export function monthsInRange(start, end) { return ALL_MONTHS.filter(m => m >= start && m <= end); }
export function monthLabel(periodId, lang, short = false) { const [y, m] = periodId.split('-').map(Number); return new Intl.DateTimeFormat(lang === 'uk' ? 'uk-UA' : 'en-GB', { month: short ? 'short' : 'long', year: short ? undefined : 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1))); }
export function rangeLabel(start, end, lang) { return start === end ? monthLabel(start, lang) : `${monthLabel(start, lang)} – ${monthLabel(end, lang)}`; }
export function formatNumber(value, lang, digits = 0) { if (value === null || value === undefined || !Number.isFinite(value))
    return '—'; return new Intl.NumberFormat(lang === 'uk' ? 'uk-UA' : 'en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value); }
export function formatDuration(hours, lang) { if (hours === null || hours === undefined || !Number.isFinite(hours))
    return '—'; if (hours < 1)
    return `${formatNumber(Math.round(hours * 60), lang)} ${lang === 'uk' ? 'хв' : 'min'}`; return `${formatNumber(hours, lang, hours < 10 ? 1 : 0)} ${lang === 'uk' ? 'год' : 'hr'}`; }
export function affectedDaysPct(row) { return row.available_school_days_average_school_location > 0 ? row.affected_school_days_average_school_location / row.available_school_days_average_school_location * 100 : null; }
export function isAnalyticallyUnavailable(row) { return row.coverage_status === 'unavailable' || row.available_school_seconds_average_school_location <= 0; }
export function otherModalities(row) { if (row.school_year === '2022_2023')
    return null; const x = row.learners_total - row.learners_offline - row.learners_online - row.learners_mixed; if (x < -0.5)
    throw new Error(`Negative modality residual: ${row.area_id} ${row.school_year}`); return Math.max(0, x); }
export function aggregateRange(rows, start, end) {
    const chosen = rows.filter(r => r.period_type === 'month' && r.period_id >= start && r.period_id <= end).sort((a, b) => a.period_id.localeCompare(b.period_id));
    if (!chosen.length)
        return null;
    const first = chosen[0];
    const n = (k) => chosen.reduce((a, r) => a + (typeof r[k] === 'number' ? r[k] : 0), 0);
    const alarm = n('alarm_seconds_average_school_location'), available = n('available_school_seconds_average_school_location'), affected = n('affected_school_days_average_school_location'), days = n('available_school_days_average_school_location');
    const years = [...new Set(chosen.map(r => r.school_year))];
    const coverage = available <= 0 ? 'unavailable' : chosen.every(r => r.coverage_status === 'complete') ? 'complete' : 'partial';
    return { ...first, period_type: 'derived_range', period_id: `${start}..${end}`, school_year: years.length === 1 ? years[0] : 'MULTI_YEAR', alarm_seconds_average_school_location: alarm, alarm_hours_average_school_location: alarm / 3600, available_school_seconds_average_school_location: available, expected_school_seconds_average_school_location: n('expected_school_seconds_average_school_location'), school_time_under_alarm_pct: available > 0 ? alarm / available * 100 : null, affected_school_days_average_school_location: affected, available_school_days_average_school_location: days, expected_school_days_average_school_location: n('expected_school_days_average_school_location'), school_time_alarm_episodes_average_school_location: chosen.length === 1 ? chosen[0].school_time_alarm_episodes_average_school_location : null, coverage_status: coverage, school_count: 0, learners_total: 0, learners_offline: 0, learners_online: 0, learners_mixed: 0, education_snapshot_date: '' };
}
export function educationContexts(rows, start, end) {
    const years = [...new Set(monthsInRange(start, end).map(schoolYearForMonth))];
    const contexts = [];
    for (const year of years) {
        const row = rows.find(r => r.school_year === year && r.period_type === 'school_year') ?? rows.find(r => r.school_year === year);
        if (row)
            contexts.push({ schoolYear: year, row, other: otherModalities(row) });
    }
    return contexts;
}
export function mapScopeForArea(areaId, lookup) { if (areaId === 'UA')
    return { level: 'oblast' }; if (lookup.oblasts[areaId])
    return { level: 'hromada', oblastId: areaId }; const oblastId = lookup.hromadas[areaId]?.oblast_id; return oblastId ? { level: 'hromada', oblastId } : { level: 'oblast' }; }
export function periodBounds(state) { if (state.periodMode === 'school_year') {
    const m = monthsForSchoolYear(state.schoolYear);
    return { start: m[0], end: m[m.length - 1] };
} if (state.periodMode === 'month')
    return { start: state.month, end: state.month }; if (state.periodMode === 'all_available')
    return { start: ALL_MONTHS[0], end: ALL_MONTHS[ALL_MONTHS.length - 1] }; return { start: state.rangeStart, end: state.rangeEnd }; }
export function periodLabel(state, lang) { if (state.periodMode === 'school_year')
    return lang === 'uk' ? `Весь навчальний рік · ${SCHOOL_YEAR_LABELS[state.schoolYear]}` : `Whole school year · ${SCHOOL_YEAR_LABELS[state.schoolYear]}`; const b = periodBounds(state); if (state.periodMode === 'all_available')
    return lang === 'uk' ? `Усі доступні дані · ${rangeLabel(b.start, b.end, lang)}` : `All available data · ${rangeLabel(b.start, b.end, lang)}`; return rangeLabel(b.start, b.end, lang); }
const LANG_KEY = 'aae.language', DASH_KEY = 'aae.lastDashboardUrl';
export function preferredLanguage(explicit, saved) { return explicit === 'uk' || explicit === 'en' ? explicit : saved ?? 'uk'; }
export function dashboardUrlWithLanguage(raw, lang, base) { const url = new URL(raw, base); url.searchParams.set('lang', lang); return url.href; }
export function savedLanguage() { try {
    const x = localStorage.getItem(LANG_KEY);
    return x === 'uk' || x === 'en' ? x : null;
}
catch {
    return null;
} }
export function saveLanguage(lang) { try {
    localStorage.setItem(LANG_KEY, lang);
}
catch { } }
export function saveDashboardUrl() { try {
    sessionStorage.setItem(DASH_KEY, location.href);
}
catch { } }
export function lastDashboardUrl(fallback = './index.html') { try {
    return sessionStorage.getItem(DASH_KEY) ?? fallback;
}
catch {
    return fallback;
} }
export function defaultState(years) { const schoolYear = years.at(-1); const ms = monthsForSchoolYear(schoolYear); return { lang: savedLanguage() ?? 'uk', periodMode: 'school_year', schoolYear, month: ms[0], rangeStart: ALL_MONTHS[0], rangeEnd: ALL_MONTHS.at(-1), areaId: 'UA', mapMeasure: 'school_time_under_alarm_pct', trendMeasure: 'alarm_hours_average_school_location', temporalView: 'monthly' }; }
export function stateFromUrl(years, areas) { const s = defaultState(years), p = new URLSearchParams(location.search); let corrected = false; const lang = p.get('lang'); if (lang === 'uk' || lang === 'en')
    s.lang = lang;
else if (lang)
    corrected = true; const mode = p.get('mode'); if (mode && ['school_year', 'month', 'custom_range', 'all_available'].includes(mode))
    s.periodMode = mode;
else if (mode)
    corrected = true; const sy = p.get('year'); if (sy && years.includes(sy))
    s.schoolYear = sy;
else if (sy)
    corrected = true; const month = p.get('month'); if (month && ALL_MONTHS.includes(month))
    s.month = month;
else if (month)
    corrected = true; const from = p.get('from'), to = p.get('to'); if (from && ALL_MONTHS.includes(from))
    s.rangeStart = from;
else if (from)
    corrected = true; if (to && ALL_MONTHS.includes(to))
    s.rangeEnd = to;
else if (to)
    corrected = true; if (s.rangeStart > s.rangeEnd) {
    [s.rangeStart, s.rangeEnd] = [s.rangeEnd, s.rangeStart];
    corrected = true;
} const area = p.get('area'); if (area && areas.has(area))
    s.areaId = area;
else if (area)
    corrected = true; const map = p.get('map'); if (map && ['school_time_under_alarm_pct', 'alarm_hours_average_school_location', 'affected_school_days_pct'].includes(map))
    s.mapMeasure = map;
else if (map)
    corrected = true; const trend = p.get('trend'); if (trend && ['school_time_under_alarm_pct', 'alarm_hours_average_school_location', 'affected_school_days_pct'].includes(trend))
    s.trendMeasure = trend;
else if (trend)
    corrected = true; const tv = p.get('view'); if (tv && ['monthly', 'school_years', 'heatmap'].includes(tv))
    s.temporalView = tv;
else if (tv)
    corrected = true; return { state: s, corrected }; }
export function updateUrl(s) { const p = new URLSearchParams({ lang: s.lang, mode: s.periodMode, area: s.areaId, map: s.mapMeasure, trend: s.trendMeasure, view: s.temporalView }); if (s.periodMode === 'school_year')
    p.set('year', s.schoolYear); if (s.periodMode === 'month')
    p.set('month', s.month); if (s.periodMode === 'custom_range') {
    p.set('from', s.rangeStart);
    p.set('to', s.rangeEnd);
} history.replaceState(null, '', `${location.pathname}?${p}`); saveDashboardUrl(); }
