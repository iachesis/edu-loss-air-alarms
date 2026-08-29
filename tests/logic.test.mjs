import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const logicSource = readFileSync(new URL('../src/logic.js', import.meta.url), 'utf8');
const { affectedDaysPct, aggregateRange, aggregateSourcePrecision, availabilityReasonKey, buildComparisonCsv, cleanDashboardUrl, clampedTooltipPosition, coverageDescriptionKey, isAnalyticallyUnavailable } = await import(`data:text/javascript;base64,${Buffer.from(logicSource).toString('base64')}`);
const nationalRows = readJson('../data/national_monthly.json');
const nationalSchoolYears = readJson('../data/national_school_year.json');
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
const analyticalFields = [
    'alarm_seconds_average_school_location',
    'alarm_hours_average_school_location',
    'available_school_seconds_average_school_location',
    'expected_school_seconds_average_school_location',
    'school_time_under_alarm_pct',
    'affected_school_days_average_school_location',
    'available_school_days_average_school_location',
    'expected_school_days_average_school_location',
    'affected_school_days_pct',
    'school_time_alarm_episodes_average_school_location',
];
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

function weightedComponent(periodId, comparableSchoolCount, alarmSeconds, coverageStatus = 'complete') {
    const row = component(periodId, coverageStatus, 100);
    return {
        ...row,
        comparable_school_count: comparableSchoolCount,
        alarm_seconds_average_school_location: alarmSeconds,
        alarm_hours_average_school_location: alarmSeconds / 3600,
        school_time_under_alarm_pct: alarmSeconds,
        affected_school_days_average_school_location: alarmSeconds,
        available_school_days_average_school_location: 100,
    };
}

function assertClose(actual, expected, tolerance = 1e-10) {
    assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

test('real multi-year and all-available Ukraine ranges use comparable-weighted ratios', () => {
    const custom = aggregateRange(nationalRows, '2024-09', '2025-10');
    assertClose(custom.school_time_under_alarm_pct, 9.5795472612);
    assertClose(affectedDaysPct(custom), 43.8327970085);
    assert.equal(custom.comparable_school_count, null);

    const all = aggregateRange(nationalRows, nationalRows[0].period_id, nationalRows.at(-1).period_id);
    assertClose(all.school_time_under_alarm_pct, 10.2997385493);
    assertClose(affectedDaysPct(all), 44.9299644935);
    assert.equal(all.comparable_school_count, null);
});

for (const [schoolYear, start, end] of [['2024_2025', '2024-09', '2025-06'], ['2025_2026', '2025-09', '2026-06']]) {
    test(`${schoolYear}: monthly reconstruction retains the static school-year ratios`, () => {
        const derived = aggregateRange(nationalRows, start, end);
        const published = nationalSchoolYears.find(row => row.school_year === schoolYear);
        assertClose(derived.school_time_under_alarm_pct, published.school_time_under_alarm_pct, 1e-6);
        assertClose(affectedDaysPct(derived), affectedDaysPct(published), 1e-6);
        assert.equal(derived.comparable_school_count, published.comparable_school_count);
    });
}

test('changing comparable denominators reconstruct weighted totals instead of returning 5.5 percent', () => {
    const rows = [weightedComponent('2024-09', 10, 10), weightedComponent('2024-10', 20, 1)];
    const derived = aggregateRange(rows, '2024-09', '2024-10');
    assert.equal((10 + 1) / (100 + 100) * 100, 5.5);
    assertClose(derived.school_time_under_alarm_pct, 4);
    assertClose(affectedDaysPct(derived), 4);
    assert.equal(derived.comparable_school_count, null);
});

test('a constant comparable denominator preserves the normalized-sum result', () => {
    const rows = [weightedComponent('2024-09', 10, 10), weightedComponent('2024-10', 10, 1)];
    const derived = aggregateRange(rows, '2024-09', '2024-10');
    assertClose(derived.school_time_under_alarm_pct, 5.5);
    assertClose(affectedDaysPct(derived), 5.5);
    assert.equal(derived.comparable_school_count, 10);
});

test('covered zero and valid partial components remain in the weighted denominator', () => {
    const zero = weightedComponent('2024-09', 10, 0);
    const partial = weightedComponent('2024-10', 20, 6, 'partial');
    const derived = aggregateRange([zero, partial], '2024-09', '2024-10');
    assert.equal(derived.coverage_status, 'partial');
    assertClose(derived.school_time_under_alarm_pct, 4);
    assertClose(affectedDaysPct(derived), 4);
});

test('a not-covered component makes a mixed range partial without injecting zero exposure', () => {
    const covered = weightedComponent('2024-09', 10, 8);
    const notCovered = component('2024-10', 'not_covered');
    notCovered.comparable_school_count = 0;
    const derived = aggregateRange([covered, notCovered], '2024-09', '2024-10');
    assert.equal(derived.coverage_status, 'partial');
    assertClose(derived.school_time_under_alarm_pct, 8);
    assertClose(affectedDaysPct(derived), 8);
    assert.equal(derived.comparable_school_count, 10);
});

test('an unavailable component fails the derived row and CSV analytical metrics closed', () => {
    const covered = weightedComponent('2024-09', 10, 8);
    const unavailable = component('2024-10', 'unavailable');
    const derived = aggregateRange([covered, unavailable], '2024-09', '2024-10');
    assert.equal(derived.coverage_status, 'unavailable');
    assert.equal(derived.comparable_school_count, null);
    for (const field of analyticalFields)
        assert.equal(derived[field], null, field);
    const exported = csvRecord(derived);
    for (const field of ['alarm_hours', 'school_time_under_alarm_pct', 'affected_school_days', 'available_school_days', 'affected_school_days_pct', 'episodes'])
        assert.equal(exported[field], '', field);
    assert.equal(exported.coverage, 'unavailable');
});

test('CSV defence blanks hidden analytical values on any unavailable row', () => {
    const row = weightedComponent('2024-09', 10, 8);
    row.coverage_status = 'unavailable';
    const exported = csvRecord(row);
    for (const field of ['alarm_hours', 'school_time_under_alarm_pct', 'affected_school_days', 'available_school_days', 'affected_school_days_pct', 'episodes'])
        assert.equal(exported[field], '', field);
    assert.equal(exported.schools, String(row.school_count));
    assert.equal(exported.learners, String(row.learners_total));
    assert.equal(exported.source_precision, row.source_precision_label);
    assert.equal(exported.coverage, 'unavailable');
});

test('all-not-covered ranges stay distinct and export no analytical metrics', () => {
    const derived = aggregateRange([component('2024-09', 'not_covered'), component('2024-10', 'not_covered')], '2024-09', '2024-10');
    assert.equal(derived.coverage_status, 'not_covered');
    for (const field of analyticalFields)
        assert.equal(derived[field], null, field);
    const exported = csvRecord(derived);
    for (const field of ['alarm_hours', 'school_time_under_alarm_pct', 'affected_school_days', 'available_school_days', 'affected_school_days_pct', 'episodes'])
        assert.equal(exported[field], '', field);
});

test('multi-month episode totals remain unavailable', () => {
    const derived = aggregateRange([weightedComponent('2024-09', 10, 8), weightedComponent('2024-10', 10, 4)], '2024-09', '2024-10');
    assert.equal(derived.school_time_alarm_episodes_average_school_location, null);
});

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

test('national partial coverage has a specific explanation while other partial rows stay generic', () => {
    assert.equal(coverageDescriptionKey({ area_id: 'UA', coverage_status: 'partial' }), 'coveragePartialUkraineDescription');
    assert.equal(coverageDescriptionKey({ area_id: 'UA32', coverage_status: 'partial' }), 'coveragePartialDescription');
    assert.equal(coverageDescriptionKey({ area_id: 'UA32080070000050759', coverage_status: 'partial' }), 'coveragePartialDescription');
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

test('derived ranges carry a stable comparable-school denominator without changing education context', () => {
    const rows = nationalRows
        .filter(row => row.school_year === '2025_2026' && ['2025-09', '2025-10'].includes(row.period_id))
        .map(row => ({ ...row, comparable_school_count: 12723 }));
    const derived = aggregateRange(rows, '2025-09', '2025-10');
    assert.equal(derived.school_count, 12800);
    assert.equal(derived.comparable_school_count, 12723);
    assert.equal(
        derived.alarm_seconds_average_school_location,
        rows.reduce((sum, row) => sum + row.alarm_seconds_average_school_location, 0),
    );
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
