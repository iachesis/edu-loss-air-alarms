const echarts = window.echarts;

import {
    affectedDaysPct,
    formatDuration,
    formatNumber,
    isAnalyticallyUnavailable,
    monthLabel,
    SCHOOL_YEAR_LABELS,
} from './logic.js';

const charts = new WeakMap();

function instance(el) {
    if (!echarts)
        throw new Error('Chart library unavailable');
    const old = charts.get(el);
    if (old)
        old.dispose();
    const chart = echarts.init(el, null, { renderer: 'svg' });
    charts.set(el, chart);
    return chart;
}

function value(row, measure) {
    if (isAnalyticallyUnavailable(row))
        return null;
    return measure === 'affected_school_days_pct' ? affectedDaysPct(row) : row[measure];
}

function formatMeasure(raw, measure, lang) {
    if (measure === 'alarm_hours_average_school_location')
        return formatDuration(raw, lang);
    return raw === null || raw === undefined ? '—' : `${formatNumber(raw, lang, 1)}%`;
}

function axisValue(raw, measure, lang) {
    if (measure === 'alarm_hours_average_school_location')
        return formatNumber(raw, lang, raw < 10 ? 1 : 0);
    return `${formatNumber(raw, lang, 0)}%`;
}

function ariaDescription(kind, measureLabel, lang) {
    if (lang === 'uk')
        return `${kind}. Показник: ${measureLabel}.`;
    return `${kind}. Measure: ${measureLabel}.`;
}

function cartesianOptions(measure, measureLabel, lang) {
    return {
        aria: { enabled: true },
        grid: { left: 78, right: 20, top: 50, bottom: 54, containLabel: true },
        yAxis: {
            type: 'value',
            name: measureLabel,
            nameLocation: 'middle',
            nameGap: 52,
            axisLabel: { formatter: raw => axisValue(raw, measure, lang) },
        },
    };
}

export function monthlyChart(el, rows, measure, measureLabel, lang, onMonth) {
    const chart = instance(el);
    const data = [...rows].sort((a, b) => a.period_id.localeCompare(b.period_id));
    chart.setOption({
        ...cartesianOptions(measure, measureLabel, lang),
        aria: {
            enabled: true,
            description: ariaDescription(lang === 'uk' ? 'Щомісячна стовпчикова діаграма' : 'Monthly bar chart', measureLabel, lang),
        },
        tooltip: {
            trigger: 'axis',
            formatter: params => {
                const point = Array.isArray(params) ? params[0] : params;
                const row = data[point?.dataIndex];
                return row ? `<strong>${monthLabel(row.period_id, lang)}</strong><br>${measureLabel}: ${formatMeasure(value(row, measure), measure, lang)}` : '';
            },
        },
        xAxis: {
            type: 'category',
            data: data.map(row => monthLabel(row.period_id, lang, true)),
            axisLabel: { rotate: 30 },
        },
        series: [{
            name: measureLabel,
            type: 'bar',
            data: data.map(row => value(row, measure)),
            itemStyle: { color: '#286B8D' },
            emphasis: { focus: 'series' },
        }],
    });
    chart.on('click', point => {
        const row = data[point.dataIndex];
        if (row)
            onMonth(row.period_id);
    });
    return chart;
}

export function schoolYearChart(el, rows, measure, measureLabel, lang) {
    const chart = instance(el);
    const data = [...rows].sort((a, b) => a.school_year.localeCompare(b.school_year));
    chart.setOption({
        ...cartesianOptions(measure, measureLabel, lang),
        aria: {
            enabled: true,
            description: ariaDescription(lang === 'uk' ? 'Лінійна діаграма за навчальними роками' : 'School-year line chart', measureLabel, lang),
        },
        tooltip: {
            trigger: 'axis',
            formatter: params => {
                const point = Array.isArray(params) ? params[0] : params;
                const row = data[point?.dataIndex];
                return row ? `<strong>${SCHOOL_YEAR_LABELS[row.school_year]}</strong><br>${measureLabel}: ${formatMeasure(value(row, measure), measure, lang)}` : '';
            },
        },
        xAxis: { type: 'category', data: data.map(row => SCHOOL_YEAR_LABELS[row.school_year]) },
        series: [{
            name: measureLabel,
            type: 'line',
            smooth: false,
            symbolSize: 9,
            data: data.map(row => value(row, measure)),
            lineStyle: { width: 3, color: '#286B8D' },
            itemStyle: { color: '#286B8D' },
        }],
    });
    return chart;
}

export function heatmapChart(el, rows, measure, measureLabel, lang) {
    const chart = instance(el);
    const years = [...new Set(rows.map(row => row.school_year))].sort();
    const monthsEn = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const monthsUk = ['Вер', 'Жов', 'Лис', 'Гру', 'Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер'];
    const monthNames = lang === 'uk' ? monthsUk : monthsEn;
    const data = rows.map(row => {
        const month = Number(row.period_id.slice(5));
        const monthIndex = month >= 9 ? month - 9 : month + 3;
        return [monthIndex, years.indexOf(row.school_year), value(row, measure)];
    });
    const max = Math.max(1, ...data.map(point => Number(point[2] ?? 0)));
    chart.setOption({
        aria: {
            enabled: true,
            description: ariaDescription(lang === 'uk' ? 'Теплова карта за місяцями й навчальними роками' : 'Heatmap by month and school year', measureLabel, lang),
        },
        tooltip: {
            formatter: point => `${SCHOOL_YEAR_LABELS[years[point.value[1]]]} · ${monthNames[point.value[0]]}<br>${measureLabel}: ${formatMeasure(point.value[2], measure, lang)}`,
        },
        grid: { left: 72, right: 72, top: 24, bottom: 48, containLabel: true },
        xAxis: { type: 'category', data: monthNames },
        yAxis: { type: 'category', data: years.map(year => SCHOOL_YEAR_LABELS[year]) },
        visualMap: {
            min: 0,
            max,
            calculable: false,
            orient: 'vertical',
            right: 0,
            top: 'middle',
            formatter: raw => axisValue(raw, measure, lang),
        },
        series: [{
            name: measureLabel,
            type: 'heatmap',
            data,
            label: { show: false },
            emphasis: { itemStyle: { borderColor: '#102A3A', borderWidth: 2 } },
        }],
    });
    return chart;
}

export function modalityChart(el, rows, lang, labels) {
    const chart = instance(el);
    const categories = rows.map(row => SCHOOL_YEAR_LABELS[row.school_year]);
    const series = [
        [labels.offline, rows.map(row => row.learners_offline)],
        [labels.online, rows.map(row => row.learners_online)],
        [labels.mixed, rows.map(row => row.school_year === '2022_2023' ? null : row.learners_mixed)],
        [labels.other, rows.map(row => row.school_year === '2022_2023' ? null : Math.max(0, row.learners_total - row.learners_offline - row.learners_online - row.learners_mixed))],
    ];
    chart.setOption({
        aria: {
            enabled: true,
            description: lang === 'uk' ? 'Складена стовпчикова діаграма кількості учнів за формами навчання.' : 'Stacked bar chart of learner counts by education modality.',
        },
        tooltip: {
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            valueFormatter: raw => formatNumber(raw, lang),
        },
        legend: { bottom: 0, type: 'scroll' },
        grid: { left: 82, right: 18, top: 24, bottom: 66, containLabel: true },
        xAxis: { type: 'value', axisLabel: { formatter: raw => formatNumber(raw, lang) } },
        yAxis: { type: 'category', data: categories },
        series: series.map(([name, values]) => ({ name, type: 'bar', stack: 'total', data: values })),
    });
    return chart;
}

export function resizeCharts() {
    document.querySelectorAll('.chart').forEach(el => charts.get(el)?.resize());
}
