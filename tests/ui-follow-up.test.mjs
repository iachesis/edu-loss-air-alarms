import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const readJson = path => JSON.parse(read(path));
const main = read('../src/main.js');
const styles = read('../src/styles.css');
const map = read('../src/map.js');
const release = readJson('../data/release.json');
const manifest = readJson('../data/payload_manifest.json');
const oblastYears = readJson('../data/oblast_school_year.json');

test('comparison source details use compact inline triggers without row-expanding blocks', () => {
    assert.doesNotMatch(main, /comparison-technical|comparison-card-technical/);
    assert.doesNotMatch(styles, /\.comparison-technical|\.comparison-card-technical/);
    assert.match(main, /areaLine\.append\(comparisonSourceInfoTrigger\(row\)\)/);
    assert.match(main, /cardTitle\.append\(cardArea, comparisonSourceInfoTrigger\(row\)\)/);
});

test('complete rows use an info icon while exceptional rows use the badge itself', () => {
    const factory = main.match(/function comparisonSourceInfoTrigger\(row\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(factory, /coverage_status === 'complete'/);
    assert.match(factory, /source-info-icon/);
    assert.match(factory, /else[\s\S]*?status-badge status-\$\{row\.coverage_status\}/);
    assert.equal((factory.match(/document\.createElement\('button'\)/g) ?? []).length, 1);
    assert.match(styles, /\.source-info-trigger\.status-badge\s*\{[\s\S]*?min-height: 1\.35rem !important/);
});

test('one body-level floating tooltip exposes reporting level and coverage', () => {
    assert.match(main, /tooltip\.setAttribute\('role', 'tooltip'\)/);
    assert.match(main, /document\.body\.append\(tooltip\)/);
    assert.match(main, /appendDefinition\(list, tr\('precision'\), sourcePrecisionText\(row\.source_precision_label\)\)/);
    assert.match(main, /appendDefinition\(list, tr\('coverage'\), statusText\(row\.coverage_status\)\)/);
    assert.match(styles, /\.source-info-tooltip\s*\{[\s\S]*?position: fixed;/);
    assert.match(styles, /pointer-events: none;/);
    assert.doesNotMatch(main, /tableRow\.append\([^)]*source-info-tooltip/);
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
    assert.equal(release.website_release_status, 'CANDIDATE_PENDING_INDEPENDENT_ACCEPTANCE');
    assert.equal(manifest.analytical_build_id, release.analytical_build_id);
    assert.equal(manifest.analytical_payload_count, 56);
    for (const entry of manifest.analytical_payloads) {
        const bytes = readFileSync(new URL(`../data/${entry.path}`, import.meta.url));
        assert.equal(bytes.length, entry.size_bytes, entry.path);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.path);
    }
});
