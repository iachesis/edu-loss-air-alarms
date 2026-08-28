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
const INK = '#151719';
const SECONDARY = '#5B6065';
const HAIRLINE = '#D8D7D1';
const PAPER = '#F6F5F1';
const SURFACE = '#FCFCFA';
const SIGNAL = '#AD4F38';
const SIGNAL_DARK = '#843522';
const INTERFACE_FONT = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const motionDuration = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 220;

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

function tooltipOptions() {
    return {
        confine: true,
        position: ['2%', '2%'],
        backgroundColor: 'rgba(252, 252, 250, .97)',
        borderColor: '#B9BAB5',
        borderWidth: 1,
        padding: [8, 10],
        textStyle: { color: INK, fontFamily: INTERFACE_FONT, fontSize: 12 },
        extraCssText: 'border-radius:2px;box-shadow:0 8px 20px rgba(21,23,25,.12)',
    };
}

function categoryAxis(data) {
    return {
        type: 'category',
        data,
        axisLine: { lineStyle: { color: '#B9BAB5' } },
        axisTick: { show: false },
        axisLabel: { color: SECONDARY, fontFamily: INTERFACE_FONT, fontSize: 11 },
    };
}

function cartesianOptions(measure, measureLabel, lang) {
    return {
        aria: { enabled: true },
        animationDuration: motionDuration,
        animationDurationUpdate: motionDuration,
        textStyle: { color: INK, fontFamily: INTERFACE_FONT },
        grid: { left: 56, right: 18, top: 42, bottom: 48, containLabel: true },
        yAxis: {
            type: 'value',
            name: measureLabel,
            nameLocation: 'middle',
            nameGap: 48,
            nameTextStyle: { color: SECONDARY, fontFamily: INTERFACE_FONT, fontSize: 11 },
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: SECONDARY, fontFamily: INTERFACE_FONT, fontSize: 11, formatter: raw => axisValue(raw, measure, lang) },
            splitLine: { lineStyle: { color: HAIRLINE, width: 1 } },
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
            ...tooltipOptions(),
            trigger: 'axis',
            axisPointer: { type: 'line', lineStyle: { color: SIGNAL, width: 1 } },
            formatter: params => {
                const point = Array.isArray(params) ? params[0] : params;
                const row = data[point?.dataIndex];
                return row ? `<strong>${monthLabel(row.period_id, lang)}</strong><br>${measureLabel}: ${formatMeasure(value(row, measure), measure, lang)}` : '';
            },
        },
        xAxis: {
            ...categoryAxis(data.map(row => monthLabel(row.period_id, lang, true))),
            axisLabel: { color: SECONDARY, fontFamily: INTERFACE_FONT, fontSize: 11, rotate: 30 },
        },
        series: [{
            name: measureLabel,
            type: 'bar',
            data: data.map(row => value(row, measure)),
            barMaxWidth: 20,
            itemStyle: { color: SIGNAL, borderRadius: [1, 1, 0, 0] },
            emphasis: { itemStyle: { color: SIGNAL_DARK } },
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
            ...tooltipOptions(),
            trigger: 'axis',
            axisPointer: { type: 'line', lineStyle: { color: SIGNAL, width: 1 } },
            formatter: params => {
                const point = Array.isArray(params) ? params[0] : params;
                const row = data[point?.dataIndex];
                return row ? `<strong>${SCHOOL_YEAR_LABELS[row.school_year]}</strong><br>${measureLabel}: ${formatMeasure(value(row, measure), measure, lang)}` : '';
            },
        },
        xAxis: categoryAxis(data.map(row => SCHOOL_YEAR_LABELS[row.school_year])),
        series: [{
            name: measureLabel,
            type: 'line',
            smooth: false,
            symbol: 'circle',
            symbolSize: 7,
            data: data.map(row => value(row, measure)),
            lineStyle: { width: 2, color: SIGNAL },
            itemStyle: { color: SURFACE, borderColor: SIGNAL, borderWidth: 2 },
            emphasis: { itemStyle: { color: SIGNAL, borderColor: SIGNAL_DARK } },
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
        animationDuration: motionDuration,
        animationDurationUpdate: motionDuration,
        textStyle: { color: INK, fontFamily: INTERFACE_FONT },
        aria: {
            enabled: true,
            description: ariaDescription(lang === 'uk' ? 'Теплова карта за місяцями й навчальними роками' : 'Heatmap by month and school year', measureLabel, lang),
        },
        tooltip: {
            ...tooltipOptions(),
            formatter: point => `${SCHOOL_YEAR_LABELS[years[point.value[1]]]} · ${monthNames[point.value[0]]}<br>${measureLabel}: ${formatMeasure(point.value[2], measure, lang)}`,
        },
        grid: { left: 58, right: 84, top: 24, bottom: 48, containLabel: true },
        xAxis: categoryAxis(monthNames),
        yAxis: {
            ...categoryAxis(years.map(year => SCHOOL_YEAR_LABELS[year])),
            axisLine: { show: false },
        },
        visualMap: {
            min: 0,
            max,
            calculable: false,
            orient: 'vertical',
            right: 0,
            top: 'middle',
            formatter: raw => axisValue(raw, measure, lang),
            textStyle: { color: SECONDARY, fontFamily: INTERFACE_FONT, fontSize: 10 },
            inRange: { color: ['#EEF0ED', '#E6DAD4', '#D8B9AB', '#C7826B', '#A74731'] },
        },
        series: [{
            name: measureLabel,
            type: 'heatmap',
            data,
            label: { show: false },
            itemStyle: { borderColor: PAPER, borderWidth: 2 },
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
        animationDuration: motionDuration,
        animationDurationUpdate: motionDuration,
        color: ['#203A47', '#9CA9AA', '#C7846B', '#D8D7D1'],
        textStyle: { color: INK, fontFamily: INTERFACE_FONT },
        aria: {
            enabled: true,
            description: lang === 'uk' ? 'Складена стовпчикова діаграма кількості учнів за формами навчання.' : 'Stacked bar chart of learner counts by education modality.',
        },
        tooltip: {
            ...tooltipOptions(),
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            valueFormatter: raw => formatNumber(raw, lang),
        },
        legend: { bottom: 0, type: 'scroll', itemWidth: 12, itemHeight: 8, textStyle: { color: SECONDARY, fontFamily: INTERFACE_FONT, fontSize: 11 } },
        grid: { left: 68, right: 16, top: 18, bottom: 62, containLabel: true },
        xAxis: {
            type: 'value',
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: SECONDARY, fontSize: 10, formatter: raw => formatNumber(raw, lang) },
            splitLine: { lineStyle: { color: HAIRLINE } },
        },
        yAxis: {
            ...categoryAxis(categories),
            axisLine: { show: false },
        },
        series: series.map(([name, values]) => ({ name, type: 'bar', stack: 'total', barMaxWidth: 34, data: values })),
    });
    return chart;
}

export function resizeCharts() {
    document.querySelectorAll('.chart').forEach(el => charts.get(el)?.resize());
}
