import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const national = readJson('../data/national_school_year.json');
const oblast = readJson('../data/oblast_school_year.json');
const oblastMonthly = readJson('../data/oblast_monthly.json');
const release = readJson('../data/release.json');
const validation = readJson('../data/stage_e_validation.json');
const schema = readJson('../data/schemas/payload-row.schema.json');

function nationalYear(periodId) {
    return national.find(row => row.period_id === periodId);
}

test('2025/26 national values use the comparable-school denominator and preserve education context', () => {
    const row = nationalYear('2025_2026');
    assert.equal(row.school_count, 12800);
    assert.equal(row.comparable_school_count, 12723);
    assert.equal(row.learners_total, 3534336);
    assert.equal(row.alarm_hours_average_school_location, 169.938713);
    assert.equal(row.affected_school_days_average_school_location, 80.584532);
    assert.equal(row.available_school_days_average_school_location, 197);
    assert.equal(row.school_time_alarm_episodes_average_school_location, 136.021064);
    assert.equal(row.school_time_under_alarm_pct, 12.323329);
    assert.equal(Number((row.affected_school_days_average_school_location / row.available_school_days_average_school_location * 100).toFixed(6)), 40.905854);
    assert.equal(row.coverage_status, 'partial');
    assert.equal(row.source_precision_label, 'mixed');
});

test('2024/25 national values use the comparable-school denominator and preserve education context', () => {
    const row = nationalYear('2024_2025');
    assert.equal(row.school_count, 13488);
    assert.equal(row.comparable_school_count, 13405);
    assert.equal(row.learners_total, 3692865);
    assert.equal(row.alarm_hours_average_school_location, 134.321636);
    assert.equal(row.affected_school_days_average_school_location, 88.33853);
    assert.equal(row.available_school_days_average_school_location, 196);
    assert.equal(row.school_time_alarm_episodes_average_school_location, 151.042596);
    assert.equal(row.school_time_under_alarm_pct, 9.790207);
    assert.equal(Number((row.affected_school_days_average_school_location / row.available_school_days_average_school_location * 100).toFixed(6)), 45.070679);
    assert.equal(row.coverage_status, 'partial');
    assert.equal(row.source_precision_label, 'mixed');
});

test('checked 2025/26 oblasts preserve numerics and publish mixed source reporting', () => {
    const expectedHours = { UA32: 70.953287, UA05: 36.957251, UA59: 625.432918 };
    for (const [areaId, hours] of Object.entries(expectedHours)) {
        const row = oblast.find(candidate => candidate.area_id === areaId && candidate.period_id === '2025_2026');
        assert.equal(row.alarm_hours_average_school_location, hours, areaId);
        assert.equal(row.source_precision_label, 'mixed', areaId);
        assert.equal(row.comparable_school_count, row.school_count, areaId);
    }
});

test('no positive oblast aggregate retains a false not-applicable label', () => {
    const falseNotApplicable = [...oblastMonthly, ...oblast].filter(row =>
        row.alarm_seconds_average_school_location > 0
        && row.source_precision_label === 'not applicable');
    assert.deepEqual(falseNotApplicable, []);
});

test('machine-readable schema and release evidence bind the corrected candidate', () => {
    assert.ok(schema.required.includes('comparable_school_count'));
    assert.equal(schema.properties.comparable_school_count.minimum, 0);
    assert.equal(release.analytical_build_id, 'AAE-FULL-b8f2d318b6a6266661');
    assert.equal(release.analytical_source_sha256, '108954bb2bb28db064069de724fbd67a74bd2a581460bb98e59421e887780445');
    assert.equal(release.website_release_status, 'CANDIDATE_PENDING_INDEPENDENT_ACCEPTANCE');
    assert.deepEqual(release.delivery.stage_d_material_corrections, ['AAE-D-MAT-01', 'AAE-D-MAT-02']);
    assert.equal(validation.analytical_differential.status, 'PASS');
    assert.equal(validation.analytical_differential.unexpected_difference_count, 0);
    assert.equal(validation.independent_post_correction_reaudit_required, true);
});
