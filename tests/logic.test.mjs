import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const logicSource = readFileSync(new URL('../src/logic.js', import.meta.url), 'utf8');
const { aggregateRange, aggregateSourcePrecision, buildComparisonCsv } = await import(`data:text/javascript;base64,${Buffer.from(logicSource).toString('base64')}`);
const nationalRows = readJson('../data/national_monthly.json');
const oblastRows = readJson('../data/oblast_monthly.json');
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
    const unavailable = oblastRows.filter(row => row.coverage_status === 'unavailable').slice(0, 2);
    const applicable = oblastRows.find(row => row.area_id === 'UA05' && row.period_id === '2022-09');
    assert.equal(aggregateSourcePrecision(notApplicable), 'not applicable');
    assert.equal(unavailable.length, 2);
    assert.equal(aggregateSourcePrecision(unavailable), null);
    assert.equal(aggregateSourcePrecision([...unavailable, applicable]), 'oblast allocation');
});
