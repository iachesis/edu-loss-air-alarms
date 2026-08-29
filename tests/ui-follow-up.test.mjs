import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const readJson = path => JSON.parse(read(path));
const index = read('../index.html');
const main = read('../src/main.js');
const styles = read('../src/styles.css');
const map = read('../src/map.js');
const charts = read('../src/charts.js');
const resourcesSource = read('../src/resources.js');
const logicSource = read('../src/logic.js');
const resources = (await import(`data:text/javascript;base64,${Buffer.from(resourcesSource).toString('base64')}`)).resources;
const { monthLabel } = await import(`data:text/javascript;base64,${Buffer.from(logicSource).toString('base64')}`);
const chartLabelHelperSource = charts.match(/export function chartShortMonthLabel\(periodId, lang\) \{[\s\S]*?\n\}/)?.[0] ?? '';
const chartShortMonthLabel = new Function('monthLabel', `${chartLabelHelperSource.replace('export ', '')}; return chartShortMonthLabel;`)(monthLabel);
const release = readJson('../data/release.json');
const manifest = readJson('../data/payload_manifest.json');
const oblastYears = readJson('../data/oblast_school_year.json');

test('comparison source details use compact inline triggers without row-expanding blocks', () => {
    assert.doesNotMatch(main, /comparison-technical|comparison-card-technical/);
    assert.doesNotMatch(styles, /\.comparison-technical|\.comparison-card-technical/);
    assert.match(main, /areaLine\.append\(comparisonSourceInfoTrigger\(row\)\)/);
    assert.match(main, /cardTitle\.append\(cardArea, comparisonSourceInfoTrigger\(row\)\)/);
});

test('every desktop and mobile comparison row uses the same circular info trigger', () => {
    const factory = main.match(/function comparisonSourceInfoTrigger\(row\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(factory, /source-info-icon/);
    assert.doesNotMatch(factory, /coverage_status|status-badge|statusText/);
    assert.equal((factory.match(/document\.createElement\('button'\)/g) ?? []).length, 1);
    assert.match(main, /areaLine\.append\(comparisonSourceInfoTrigger\(row\)\)/);
    assert.match(main, /cardTitle\.append\(cardArea, comparisonSourceInfoTrigger\(row\)\)/);
    assert.doesNotMatch(main, /className = `status-badge|textContent = statusText\(row\.coverage_status\)/);
    assert.doesNotMatch(styles, /\.source-info-trigger\.status-badge|\.status-badge\s*\{/);
});

test('one body-level floating tooltip exposes reporting level and styled exceptional coverage', () => {
    assert.match(main, /tooltip\.setAttribute\('role', 'tooltip'\)/);
    assert.match(main, /document\.body\.append\(tooltip\)/);
    assert.match(main, /appendDefinition\(list, tr\('precision'\), sourcePrecisionText\(row\.source_precision_label\)\)/);
    assert.match(main, /appendCoverageDefinition\(list, row\)/);
    const coverage = main.match(/function appendCoverageDefinition\(list, row\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(coverage, /coverage_status === 'complete'[\s\S]*?valueElement\.textContent = shown/);
    assert.match(coverage, /tooltip-status tooltip-status-\$\{row\.coverage_status\.replace\('_', '-'\)\}/);
    assert.match(coverage, /status\.textContent = shown/);
    assert.match(styles, /\.tooltip-status\s*\{[\s\S]*?var\(--signal-dark\)/);
    assert.match(styles, /\.source-info-tooltip\s*\{[\s\S]*?position: fixed;/);
    assert.match(styles, /pointer-events: none;/);
    assert.doesNotMatch(main, /tableRow\.append\([^)]*source-info-tooltip/);
});

test('context navigation is hierarchical, state-preserving and non-actionable at Ukraine', () => {
    assert.match(index, /<div id="context-navigation" class="context-navigation">\s*<button id="back-to-parent"[^>]+hidden>/);
    assert.equal(resources.en.translation.backToUkraine, '← Back to Ukraine');
    assert.equal(resources.uk.translation.backToUkraine, '← Назад до України');
    assert.equal(resources.en.translation.backToOblast, '← Back to {{oblast}}');
    assert.equal(resources.uk.translation.backToOblast, '← Назад до {{oblast}}');
    const renderer = main.match(/function renderContextNavigation\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(renderer, /parentArea\(state\.areaId\)/);
    assert.match(renderer, /if \(!parentId\)[\s\S]*?button\.hidden = true/);
    assert.match(renderer, /parentId === 'UA' \? tr\('backToUkraine'\) : tr\('backToOblast'/);
    assert.match(renderer, /button\.hidden = false/);
    assert.doesNotMatch(renderer, /navigation\.hidden/);
    const selection = main.split('\n').find(line => line.startsWith('async function selectArea(id)')) ?? '';
    assert.match(selection, /^async function selectArea\(id\) \{ state\.areaId = id;/);
    assert.doesNotMatch(selection, /periodMode|schoolYear|month|rangeStart|rangeEnd|mapMeasure|trendMeasure|temporalView|lang\s*=/);
    assert.match(main, /'back-to-parent'\)\.addEventListener\('click',[\s\S]*?parentArea\(state\.areaId\)[\s\S]*?selectArea\(parentId\)/);
});

test('context navigation reserves one compact row without moving the hero', () => {
    const slot = styles.match(/\.context-navigation\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(slot, /display: flex/);
    assert.match(slot, /min-height: 2\.15rem/);
    assert.match(slot, /margin-top: \.45rem/);
    assert.doesNotMatch(index, /id="context-navigation"[^>]+hidden/);
    assert.ok(index.indexOf('id="context-navigation"') < index.indexOf('class="hero-analysis"'));
    assert.match(styles, /\.context-navigation-button\s*\{[\s\S]*?background: transparent;[\s\S]*?border: 0;/);
});

test('monthly chart uses three-letter English labels without changing Ukrainian or long labels', () => {
    const periods = ['2024-09', '2024-10', '2024-11', '2024-12', '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06'];
    assert.deepEqual(periods.map(period => chartShortMonthLabel(period, 'en')), ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']);
    assert.ok(periods.map(period => chartShortMonthLabel(period, 'en')).every(label => label.length === 3));
    assert.deepEqual(periods.map(period => chartShortMonthLabel(period, 'uk')), periods.map(period => monthLabel(period, 'uk', true)));
    assert.match(charts, /categoryAxis\(data\.map\(row => chartShortMonthLabel\(row\.period_id, lang\)\)\)/);
    assert.match(charts, /<strong>\$\{monthLabel\(row\.period_id, lang\)\}<\/strong>/);
    assert.match(charts, /const monthsEn = \['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'\]/);
    assert.match(charts, /const monthsUk = \['Вер', 'Жов', 'Лис', 'Гру', 'Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер'\]/);
});

test('tooltip interaction supports pointer, keyboard focus, touch fallback and cleanup', () => {
    const binder = main.match(/function bindSourceInfoTrigger\(trigger, row\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(binder, /'pointerenter'[\s\S]*?showSourceInfoTooltip/);
    assert.match(binder, /'pointerleave'[\s\S]*?hideSourceInfoTooltip/);
    assert.match(binder, /'focus'[\s\S]*?showSourceInfoTooltip/);
    assert.match(binder, /'blur'[\s\S]*?hideSourceInfoTooltip/);
    assert.match(binder, /'pointerdown'[\s\S]*?stopPropagation/);
    assert.match(binder, /'click'[\s\S]*?preventDefault[\s\S]*?stopPropagation[\s\S]*?focus/);
    assert.match(main, /function renderComparison\(\) \{\s*hideSourceInfoTooltip\(\)/);
    assert.match(main, /function repositionActiveSourceInfoTooltip\(\)/);
    assert.match(main, /window\.addEventListener\('resize', repositionActiveSourceInfoTooltip\)/);
    assert.match(main, /window\.addEventListener\('scroll', repositionActiveSourceInfoTooltip, true\)/);
});

test('floating tooltip position is clamped to the viewport', () => {
    const positioner = main.match(/function positionSourceInfoTooltip\(trigger, tooltip\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(positioner, /trigger\.getBoundingClientRect\(\)/);
    assert.match(positioner, /tooltip\.getBoundingClientRect\(\)/);
    assert.match(positioner, /window\.innerWidth/);
    assert.match(positioner, /window\.innerHeight/);
    assert.match(positioner, /Math\.min/);
    assert.match(positioner, /Math\.max/);
});

test('full extent is top-right and the map is an isolated lower stacking context', () => {
    assert.match(map, /L\.control\(\{ position: 'topright' \}\)/);
    assert.doesNotMatch(map, /position: 'bottomright'/);
    const mapStage = styles.match(/\.map-stage\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(mapStage, /position: relative/);
    assert.match(mapStage, /isolation: isolate/);
    assert.match(mapStage, /z-index: 0/);
    assert.match(styles, /\.instrument-toolbar\s*\{[\s\S]*?z-index: 20/);
});

test('Stage-E reporting precision and analytical payload identities remain authoritative', () => {
    const expectedHours = { UA32: 70.953287, UA05: 36.957251, UA59: 625.432918 };
    for (const [areaId, hours] of Object.entries(expectedHours)) {
        const row = oblastYears.find(candidate => candidate.area_id === areaId && candidate.period_id === '2025_2026');
        assert.equal(row.source_precision_label, 'mixed', areaId);
        assert.equal(row.alarm_hours_average_school_location, hours, areaId);
    }
    assert.equal(release.analytical_build_id, 'AAE-FULL-b8f2d318b6a6266661');
    assert.equal(release.website_release_id, 'AAE-WEB-1.1.0');
    assert.equal(release.website_release_status, 'FINAL_PUBLIC_RELEASE');
    assert.equal(manifest.analytical_build_id, release.analytical_build_id);
    assert.equal(manifest.analytical_payload_count, 56);
    for (const entry of manifest.analytical_payloads) {
        const bytes = readFileSync(new URL(`../data/${entry.path}`, import.meta.url));
        assert.equal(bytes.length, entry.size_bytes, entry.path);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.path);
    }
});
