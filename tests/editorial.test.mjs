import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const readJson = path => JSON.parse(read(path));
const index = read('../index.html');
const methodologyHtml = read('../methodology.html');
const dataHtml = read('../data.html');
const readme = read('../README.md');
const resourcesSource = read('../src/resources.js');
const content = read('../src/content-page.js');
const main = read('../src/main.js');
const map = read('../src/map.js');
const charts = read('../src/charts.js');
const resources = (await import(`data:text/javascript;base64,${Buffer.from(resourcesSource).toString('base64')}`)).resources;
const release = readJson('../data/release.json');
const manifest = readJson('../data/payload_manifest.json');

test('neutral publication title and dated subtitle are canonical in both languages', () => {
    assert.equal(resources.en.translation.appTitle, 'Air Alarms and the School Day in Ukraine');
    assert.equal(resources.uk.translation.appTitle, 'Повітряні тривоги та навчальний день в Україні');
    assert.equal(resources.en.translation.subtitle, 'Estimated overlap between recorded air alarms and modelled school hours, 2022/23–2025/26.');
    assert.equal(resources.uk.translation.subtitle, 'Оцінка перетину зафіксованих повітряних тривог із розрахунковим навчальним часом у 2022/23–2025/26 навчальних роках.');
    for (const source of [index, methodologyHtml, dataHtml, readme, resourcesSource, content, main, map, charts])
        assert.doesNotMatch(source, /\bdisrupt(?:s|ed|ing|ion|ions)?\b/i);
});

test('dynamic summaries use factual overlap language for days', () => {
    const summary = main.match(/function renderSummary\(row\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(summary, /modelled school days had at least one alarm overlap/);
    assert.match(summary, /розрахункових навчальних днів був принаймні один перетин із тривогою/);
    assert.doesNotMatch(summary, /They affected|Вони зачепили|зачепили/i);
});

test('hromada reporting level has a real label and source geography replaces geographic precision', () => {
    assert.equal(resources.en.translation.sourcePrecisionHromada, 'Hromada-level records');
    assert.equal(resources.uk.translation.sourcePrecisionHromada, 'Записи на рівні громади');
    assert.match(main, /hromada: 'sourcePrecisionHromada'/);
    assert.equal(resources.en.translation.sourceGeographyCoverage, 'Source geography and coverage');
    assert.equal(resources.uk.translation.sourceGeographyCoverage, 'Географія джерела та охоплення');
    assert.notEqual(resources.en.translation.precision, 'Geographic precision');
    assert.notEqual(resources.uk.translation.precision, 'Географічна точність');
});

test('complete coverage remains visually quiet while exceptional statuses stay visible', () => {
    const badge = main.match(/function comparisonStatusBadge\(status\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    const interpretation = main.match(/function renderInterpretation\(row\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(badge, /status === 'complete'[\s\S]*?return null/);
    assert.match(interpretation, /partial: 'coveragePartialDescription'/);
    assert.match(interpretation, /not_covered: 'coverageNotCoveredDescription'/);
    assert.doesNotMatch(interpretation, /complete:/);
});

test('methodology defines nine sections and four indicators separately in both languages', () => {
    const english = [
        'What this dashboard measures', 'Modelled school hours', 'Alarm data and interval processing',
        'Source geography', 'Indicators', 'How territory-level results are calculated',
        'Education context', 'Coverage and missing values', 'Limitations',
    ];
    const ukrainian = [
        'Що вимірює цей дашборд', 'Розрахунковий навчальний час', 'Дані про тривоги та обробка інтервалів',
        'Географія джерела', 'Показники', 'Як розраховано значення для територій',
        'Освітній контекст', 'Охоплення та відсутні значення', 'Обмеження',
    ];
    for (const heading of [...english, ...ukrainian])
        assert.match(content, new RegExp(heading));
    assert.match(content, /className = 'indicator-definitions'/);
    assert.match(content, /for \(const indicator of block\.indicators\)/);
    assert.equal((content.match(/title: 'Air-alarm time during modelled school hours'/g) ?? []).length, 1);
    assert.equal((content.match(/title: 'Share of modelled school time under air alarm'/g) ?? []).length, 1);
    assert.equal((content.match(/title: 'Modelled school days with an air alarm'/g) ?? []).length, 1);
    assert.equal((content.match(/title: 'Air-alarm episodes during modelled school hours'/g) ?? []).length, 1);
});

test('data page includes all selected education snapshot dates and seven reader sections', () => {
    for (const date of ['2023-01-01', '2024-04-20', '2025-03-20', '2026-03-09'])
        assert.match(content, new RegExp(date));
    for (const heading of ['Release at a glance', 'Air-alarm data', 'Education data', 'Geographic coverage', 'Missing-data semantics', 'Downloads', 'Technical release details'])
        assert.match(content, new RegExp(heading));
    assert.match(content, /className = 'technical-release-details'/);
});

test('source hashes are confined to collapsed technical release details', () => {
    for (const field of ['analytical_source_upstream_commit_sha', 'analytical_source_git_blob_sha1', 'analytical_source_sha256']) {
        const occurrences = [...content.matchAll(new RegExp(`release\\.${field}`, 'g'))];
        assert.equal(occurrences.length, 2, field);
        for (const occurrence of occurrences) {
            const context = content.slice(Math.max(0, occurrence.index - 800), occurrence.index);
            assert.match(context, /details:\s*\{/);
        }
    }
});

test('reader copy excludes internal audit language', () => {
    const publicCopy = [readme, index, methodologyHtml, dataHtml, resourcesSource, content, main, map, charts].join('\n');
    const banned = [
        'frozen control', 'without drift', 'controlled hromadas', 'controlled geometry',
        'generic analytical unavailability', 'immutable GitHub object', 'direct territorial result',
        'reader-facing indicators', 'zero has not been substituted', 'no zero value is invented',
        'publication architecture', 'public-safe',
    ];
    for (const phrase of banned)
        assert.doesNotMatch(publicCopy, new RegExp(phrase, 'i'), phrase);
});

test('map tooltip always includes the selected measure label and a value or reason', () => {
    assert.match(map, /<strong>\$\{name\}<\/strong><br>\$\{measureLabel\}: \$\{status \|\| shown\}/);
    assert.match(main, /state\.mapMeasure, tr\(TREND_MEASURE_TRANSLATIONS\[state\.mapMeasure\]\), state\.lang/);
});

test('all 56 analytical payloads match the unchanged manifest identities', () => {
    assert.equal(manifest.analytical_payload_count, 56);
    assert.equal(manifest.analytical_payloads.length, 56);
    for (const entry of manifest.analytical_payloads) {
        const bytes = readFileSync(new URL(`../data/${entry.path}`, import.meta.url));
        assert.equal(bytes.length, entry.size_bytes, entry.path);
        assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, entry.path);
    }
});

test('release and analytical build identities remain unchanged', () => {
    assert.equal(release.website_release_id, 'AAE-WEB-1.1.0');
    assert.equal(release.analytical_build_id, 'AAE-FULL-88db64d06afa99610f');
    assert.equal(release.website_release_status, 'CANDIDATE_PENDING_INDEPENDENT_ACCEPTANCE');
    assert.equal(manifest.release_id, release.website_release_id);
    assert.equal(manifest.analytical_build_id, release.analytical_build_id);
});
