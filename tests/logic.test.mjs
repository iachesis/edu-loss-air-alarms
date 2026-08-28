import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const logicSource = readFileSync(new URL('../src/logic.js', import.meta.url), 'utf8');
const { aggregateRange, aggregateSourcePrecision, availabilityReasonKey, buildComparisonCsv, cleanDashboardUrl, clampedTooltipPosition, isAnalyticallyUnavailable } = await import(`data:text/javascript;base64,${Buffer.from(logicSource).toString('base64')}`);
const nationalRows = readJson('../data/national_monthly.json');
const oblastRows = readJson('../data/oblast_monthly.json');
const release = readJson('../data/release.json');
const geography = readJson('../data/geography_lookup.json');
const hromadaRows = readJson('../data/hromada_monthly_UA32.json').map(row => ({
    ...row,
    area_id: row.hromada_id,
    alarm_seconds_average_school_location: row.alarm_seconds,
    alarm_hours_average_school_location: row.alarm_hours,
    available_school_seconds_average_school_location: row.available_school_seconds,
    expected_school_seconds_average_school_location: row.expected_school_seconds,
    affected_school_days_average_school_location: row.affected_school_days,
    available_school_days_average_school_location: row.available_school_days,
    expected_school_days_average_school_location: row.expected_school_days,
    school_time_alarm_episodes_average_school_location: row.school_time_alarm_episodes,
}));

const contextFields = ['school_count', 'learners_total', 'learners_offline', 'learners_online', 'learners_mixed', 'education_snapshot_date'];
const cases = [
    ['Ukraine', nationalRows],
    ['Kyiv oblast', oblastRows.filter(row => row.area_id === 'UA32')],
    ['Bucha hromada', hromadaRows.filter(row => row.area_id === 'UA32080070000050759')],
];

function csvRecord(row) {
    const [header, values] = buildComparisonCsv([row], id => id, 'AAE-FULL-9c94bc374ab5e7cf29').replace(/^\uFEFF/, '').split('\n');
    return Object.fromEntries(header.split(',').map((key, index) => [key, values.split(',')[index]]));
}

for (const [label, rows] of cases) {
    test(`${label}: a one-school-year range preserves one education snapshot`, () => {
        const component = rows.find(row => row.period_id === '2024-09');
        const derived = aggregateRange(rows, '2024-09', '2025-06');
        assert.ok(component);
        assert.ok(derived);
        for (const field of contextFields)
            assert.equal(derived[field], component[field], field);
        assert.notEqual(derived.school_count, rows.filter(row => row.school_year === '2024_2025').reduce((sum, row) => sum + row.school_count, 0));
        const exported = csvRecord(derived);
        assert.equal(exported.schools, String(component.school_count));
        assert.equal(exported.learners, String(component.learners_total));
    });

    test(`${label}: an all-available range makes single-row education context unavailable`, () => {
        const derived = aggregateRange(rows, rows[0].period_id, rows.at(-1).period_id);
        assert.ok(derived);
        for (const field of contextFields)
            assert.equal(derived[field], null, field);
        const exported = csvRecord(derived);
        assert.equal(exported.schools, '');
        assert.equal(exported.learners, '');
    });

    test(`${label}: a multi-school-year custom range makes single-row education context unavailable`, () => {
        const derived = aggregateRange(rows, '2023-09', '2024-10');
        assert.ok(derived);
        for (const field of contextFields)
            assert.equal(derived[field], null, field);
        const exported = csvRecord(derived);
        assert.equal(exported.schools, '');
        assert.equal(exported.learners, '');
    });
}

test('an inconsistent one-school-year snapshot is unavailable instead of fabricated or summed', () => {
    const rows = nationalRows.filter(row => row.period_id === '2024-09' || row.period_id === '2024-10').map(row => ({ ...row }));
    rows[1].learners_total += 1;
    const derived = aggregateRange(rows, '2024-09', '2024-10');
    for (const field of contextFields)
        assert.equal(derived[field], null, field);
});

test('real homogeneous and mixed custom ranges aggregate source precision explicitly', () => {
    const vinnytsia = oblastRows.filter(row => row.area_id === 'UA05');
    const sumy = oblastRows.filter(row => row.area_id === 'UA59');
    assert.equal(aggregateRange(vinnytsia, '2022-09', '2022-10').source_precision_label, 'oblast allocation');
    assert.equal(aggregateRange(sumy, '2022-09', '2022-10').source_precision_label, 'mixed');
});

test('real homogeneous and mixed all-available ranges aggregate source precision explicitly', () => {
    const kyivCity = oblastRows.filter(row => row.area_id === 'UA80');
    const sumy = oblastRows.filter(row => row.area_id === 'UA59');
    assert.equal(aggregateRange(kyivCity, kyivCity[0].period_id, kyivCity.at(-1).period_id).source_precision_label, 'oblast allocation');
    assert.equal(aggregateRange(sumy, sumy[0].period_id, sumy.at(-1).period_id).source_precision_label, 'mixed');
});

test('not-applicable and unavailable component rows retain missingness semantics', () => {
    const notApplicable = oblastRows.filter(row => row.area_id === 'UA05' && row.period_id === '2023-10');
    const unavailable = [0, 1].map(index => ({
        ...notApplicable[0],
        period_id: `2023-${11 + index}`,
        coverage_status: 'unavailable',
        available_school_seconds_average_school_location: 0,
    }));
    const applicable = oblastRows.find(row => row.area_id === 'UA05' && row.period_id === '2022-09');
    assert.equal(aggregateSourcePrecision(notApplicable), 'not applicable');
    assert.equal(unavailable.length, 2);
    assert.equal(aggregateSourcePrecision(unavailable), null);
    assert.equal(aggregateSourcePrecision([...unavailable, applicable]), 'oblast allocation');
});

function component(periodId, coverageStatus, availableSeconds = 0) {
    return {
        ...nationalRows.find(row => row.period_id === periodId),
        period_id: periodId,
        coverage_status: coverageStatus,
        alarm_seconds_average_school_location: availableSeconds > 0 ? 3600 : null,
        alarm_hours_average_school_location: availableSeconds > 0 ? 1 : null,
        available_school_seconds_average_school_location: availableSeconds,
        expected_school_seconds_average_school_location: 10000,
        school_time_under_alarm_pct: availableSeconds > 0 ? 3600 / availableSeconds * 100 : null,
        affected_school_days_average_school_location: availableSeconds > 0 ? 1 : null,
        available_school_days_average_school_location: availableSeconds > 0 ? 2 : 0,
        expected_school_days_average_school_location: 2,
        school_time_alarm_episodes_average_school_location: availableSeconds > 0 ? 1 : null,
    };
}

test('not-covered rows remain analytically non-numeric without becoming generic unavailable', () => {
    const row = component('2024-09', 'not_covered');
    assert.equal(isAnalyticallyUnavailable(row), true);
    const derived = aggregateRange([row, component('2024-10', 'not_covered')], '2024-09', '2024-10');
    assert.equal(derived.coverage_status, 'not_covered');
    assert.equal(derived.alarm_seconds_average_school_location, null);
    assert.equal(derived.alarm_hours_average_school_location, null);
    assert.equal(derived.school_time_under_alarm_pct, null);
    assert.equal(derived.affected_school_days_average_school_location, null);
    assert.equal(derived.source_precision_label, 'not applicable');
});

test('clean title navigation retains language and strips all dashboard state', () => {
    assert.equal(cleanDashboardUrl('en', './index.html?lang=uk&area=UA44&mode=month#map'), './index.html?lang=en');
    assert.equal(cleanDashboardUrl('uk', './index.html?area=UA32&year=2025_2026'), './index.html?lang=uk');
});

test('not-covered and generic unavailable headline reasons remain distinct', () => {
    assert.equal(availabilityReasonKey(component('2024-09', 'not_covered')), 'notCovered');
    assert.equal(availabilityReasonKey(component('2024-09', 'unavailable')), 'unavailable');
    assert.equal(availabilityReasonKey(component('2024-09', 'complete', 10000)), null);
});

test('chart tooltip position follows the datum and remains inside the viewport', () => {
    assert.deepEqual(clampedTooltipPosition([220, 180], { x: 200, y: 150, width: 40, height: 80 }, [500, 300], [140, 60]), [150, 78]);
    assert.deepEqual(clampedTooltipPosition([12, 12], { x: 0, y: 0, width: 24, height: 24 }, [320, 180], [180, 70]), [4, 36]);
    assert.deepEqual(clampedTooltipPosition([310, 170], null, [320, 180], [180, 70]), [136, 88]);
});

test('CSV uses the supplied display label instead of exposing the raw not-covered key', () => {
    const row = component('2024-09', 'not_covered');
    const csv = buildComparisonCsv([row], id => id, 'AAE-FULL-test', status => status === 'not_covered' ? 'Not covered by source' : status);
    assert.match(csv, /Not covered by source/);
    assert.doesNotMatch(csv, /not_covered/);
});

test('range coverage distinguishes complete, mixed partial and analytical failure', () => {
    const complete = component('2024-09', 'complete', 10000);
    assert.equal(aggregateRange([complete], '2024-09', '2024-09').coverage_status, 'complete');
    assert.equal(aggregateRange([complete, component('2024-10', 'not_covered')], '2024-09', '2024-10').coverage_status, 'partial');
    assert.equal(aggregateRange([component('2024-09', 'unavailable')], '2024-09', '2024-09').coverage_status, 'unavailable');
    assert.equal(aggregateRange([complete, component('2024-10', 'unavailable')], '2024-09', '2024-10').coverage_status, 'unavailable');
});

test('geography catalogue is bound to the candidate build and preserves not-covered identity', () => {
    assert.equal(geography.analytical_build_id, release.analytical_build_id);
    for (const oblastId of ['UA01', 'UA44']) {
        assert.equal(geography.oblasts[oblastId].analytical_data_available, false);
        assert.equal(geography.oblasts[oblastId].analytical_availability_status, 'not_covered');
        const hromadas = Object.values(geography.hromadas).filter(row => row.parent_oblast_id === oblastId);
        assert.ok(hromadas.length > 0);
        assert.ok(hromadas.every(row => row.analytical_data_available === false));
        assert.ok(hromadas.every(row => row.analytical_availability_status === 'not_covered'));
    }
    assert.equal(geography.oblasts.UA32.analytical_availability_status, 'available');
    assert.match(geography.oblasts.UA32.provenance.analytical, new RegExp(release.analytical_build_id));
});
