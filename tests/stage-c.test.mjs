import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const index = read('../index.html');
const methodology = read('../methodology.html');
const data = read('../data.html');
const main = read('../src/main.js');
const map = read('../src/map.js');
const logic = read('../src/logic.js');
const resourcesSource = read('../src/resources.js');
const resources = (await import(`data:text/javascript;base64,${Buffer.from(resourcesSource).toString('base64')}`)).resources;

function footer(html) {
    return html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0].trim();
}

test('all public pages use one footer without public Deliverable wording', () => {
    assert.equal(footer(index), footer(methodology));
    assert.equal(footer(index), footer(data));
    assert.doesNotMatch(footer(index), /\bD2\b|Deliverable/i);
    assert.match(footer(index), /https:\/\/etheric\.dev\//);
});

test('publication title is a clean language-preserving home link on every page', () => {
    for (const html of [index, methodology, data]) {
        assert.match(html, /id="page-title" class="publication-home-link" href="\.\/index\.html\?lang=uk"/);
    }
    assert.match(main, /\$\('page-title'\)\.href = cleanDashboardUrl\(state\.lang\)/);
});

test('modality chart is always-visible content rather than a disclosure', () => {
    assert.match(index, /<section id="modality-panel"/);
    assert.doesNotMatch(index, /<details[^>]+id="modality-/);
    assert.doesNotMatch(main, /modality-details|\.open\s*\|\|\s*!lastModalityRows/);
});

test('data-table disclosures expose localized open and closed states', () => {
    assert.equal(resources.en.translation.showDataTable, 'Show data table');
    assert.equal(resources.en.translation.hideDataTable, 'Hide data table');
    assert.equal(resources.uk.translation.showDataTable, 'Показати таблицю даних');
    assert.equal(resources.uk.translation.hideDataTable, 'Сховати таблицю даних');
    assert.match(main, /details\.open \? 'hideDataTable' : 'showDataTable'/);
});

test('headline missing values use a dash while keeping distinct accessible reasons', () => {
    assert.match(main, /unavailable \? '—' : `\$\{formatNumber\(row\.school_time_under_alarm_pct/);
    assert.match(main, /unavailable \? '—' : `\$\{formatNumber\(affectedDaysPct\(row\)/);
    assert.match(main, /dataset\.availabilityReason = reason/);
    assert.match(main, /setAttribute\('aria-label', `\$\{label\}: \$\{reason\}`\)/);
    assert.match(main, /element\.removeAttribute\('title'\)/);
    assert.doesNotMatch(main, /element\.title = reason/);
    assert.doesNotMatch(main, /alarm-time-secondary'\)\.textContent = unavailable \? unavailableText/);
});

test('comparison uses four primary columns and retains technical CSV fields', () => {
    const columns = main.match(/const columns = \[[\s\S]*?\n    \];/)?.[0] ?? '';
    assert.match(columns, /'area_name', 'area'/);
    assert.match(columns, /'school_time_under_alarm_pct', 'share'/);
    assert.match(columns, /'alarm_hours_average_school_location', 'hours'/);
    assert.match(columns, /'affected_school_days_pct', 'days'/);
    assert.doesNotMatch(columns, /'precision'|'coverage'/);
    assert.match(main, /comparisonTechnicalDetails\(row\)/);
    assert.match(logic, /'source_precision', 'coverage'/);
});

test('affected-days formulas and machine fields remain unchanged', () => {
    assert.match(logic, /affected_school_days_average_school_location \/ row\.available_school_days_average_school_location \* 100/);
    assert.match(logic, /'affected_school_days', 'available_school_days', 'affected_school_days_pct'/);
    assert.match(main, /affected_school_days_pct: 'daysShare'/);
});

test('full-extent control converges intercepted keyboard activation on its click path', () => {
    assert.match(map, /button\.type = 'button'/);
    assert.match(map, /button\.title = label/);
    assert.match(map, /button\.setAttribute\('aria-label', label\)/);
    assert.match(map, /L\.DomEvent\.on\(button, 'click'/);
    const keyboardHandler = map.match(/L\.DomEvent\.on\(button, 'keydown',[\s\S]*?\n        \}\);/)?.[0] ?? '';
    assert.match(keyboardHandler, /L\.DomEvent\.preventDefault\(event\)/);
    assert.match(keyboardHandler, /button\.click\(\)/);
    assert.doesNotMatch(keyboardHandler, /showFullExtent|onFullExtent/);
});

test('all four final human-facing indicator names are present and obsolete labels are absent', () => {
    const expected = {
        en: [
            'Air-alarm time during assumed school hours',
            'Share of assumed school time under air alarm',
            'Assumed school days with air alarms during assumed school hours',
            'Air-alarm episodes overlapping assumed school time',
        ],
        uk: [
            'Час повітряних тривог у межах припущеного навчального часу',
            'Частка припущеного навчального часу, перекрита повітряними тривогами',
            'Припущені навчальні дні з повітряними тривогами в межах припущеного навчального часу',
            'Епізоди повітряних тривог, що перетнулися з припущеним навчальним часом',
        ],
    };
    assert.deepEqual([
        resources.en.translation.alarmTime,
        resources.en.translation.alarmShare,
        resources.en.translation.affectedDays,
        resources.en.translation.episodes,
    ], expected.en);
    assert.deepEqual([
        resources.uk.translation.alarmTime,
        resources.uk.translation.alarmShare,
        resources.uk.translation.affectedDays,
        resources.uk.translation.episodes,
    ], expected.uk);
    assert.equal(resources.en.translation.daysShare, 'Share of available assumed school days with air alarms during assumed school hours');
    assert.equal(resources.en.translation.days, 'Share of available assumed school days with air alarms during assumed school hours');
    assert.equal(resources.uk.translation.daysShare, 'Частка доступних припущених навчальних днів із повітряними тривогами в межах припущеного навчального часу');
    assert.equal(resources.uk.translation.days, 'Частка доступних припущених навчальних днів із повітряними тривогами в межах припущеного навчального часу');
    assert.doesNotMatch(resourcesSource, /Alarm time within the school day|Share of school time|School days affected|Alarm episodes within the school day|Assumed school days with an air alarm|Share of available assumed school days with an air alarm|Припущені навчальні дні з повітряною тривогою|Частка доступних припущених навчальних днів із повітряною тривогою/);
});
