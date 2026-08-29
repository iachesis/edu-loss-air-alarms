import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const index = read('../index.html');
const main = read('../src/main.js');
const styles = read('../src/styles.css');

const helper = main.match(/function dismissAppMessage[\s\S]*?function normalize/)?.[0] ?? '';
const ensureHromada = main.match(/async function ensureHromada\(oblastId\) \{[\s\S]*?\n\}/)?.[0] ?? '';
const renderTime = main.match(/async function renderTime\(\) \{[\s\S]*?\n\}/)?.[0] ?? '';

test('global app message is fixed, top-centred and outside dashboard flow', () => {
    assert.match(index, /<div id="app-message-region" class="app-message-region" role="status" aria-live="polite" aria-atomic="true">/);
    assert.ok(index.indexOf('id="app-message-region"') > index.indexOf('</main>'));
    const region = styles.match(/\.app-message-region\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(region, /position: fixed/);
    assert.match(region, /top: 14px/);
    assert.match(region, /left: 50%/);
    assert.match(region, /width: min\(420px, calc\(100vw - 24px\)\)/);
    assert.match(region, /z-index: 4000/);
    assert.match(region, /pointer-events: none/);
});

test('app message helper is non-modal, replace-in-place and non-focus-stealing', () => {
    assert.match(helper, /role', kind === 'error' \? 'alert' : 'status'/);
    assert.match(helper, /aria-live', kind === 'error' \? 'assertive' : 'polite'/);
    assert.match(helper, /message\.textContent = text/);
    assert.match(helper, /activeAppMessageKey = key/);
    assert.match(helper, /clearTimeout\(appMessageDismissTimer\)/);
    assert.match(helper, /message\.classList\.add\('is-visible'\)/);
    assert.doesNotMatch(helper, /focus\(|tabIndex|showModal|dialog/);
});

test('initial loading uses the fixed message and leaves no flow placeholder', () => {
    assert.doesNotMatch(index, /id="loading"/);
    assert.match(main, /showAppMessage\(tr\('loading'\), \{ kind: 'loading', persistent: true, key: 'initial-loading' \}\)/);
    assert.match(main, /dismissAppMessage\('initial-loading'\)/);
    assert.doesNotMatch(styles, /#loading\s*\{/);
});

test('selected-oblast loading and completion use the global message', () => {
    assert.doesNotMatch(index, /id="area-load-status"/);
    assert.match(ensureHromada, /showAppMessage\(tr\('loadingArea'\), \{ kind: 'loading', persistent: true, key: 'area-loading' \}\)/);
    assert.match(ensureHromada, /setAttribute\('aria-busy', 'true'\)/);
    assert.match(ensureHromada, /dismissAppMessage\('area-loading'\)/);
    assert.match(ensureHromada, /showAppMessage\(tr\('loadAreaFailed'\), \{ kind: 'error'/);
    assert.match(ensureHromada, /setAttribute\('aria-busy', 'false'\)/);
});

test('CSV success, corrected parameters and chart failure use global messages', () => {
    assert.doesNotMatch(index, /id="csv-status"|id="parameter-notice"|id="chart-error"/);
    assert.match(main, /showAppMessage\(tr\('csvPrepared', \{ count: currentRows\.length \}\), \{ kind: 'success', duration: 3500, key: 'csv-prepared' \}\)/);
    assert.match(main, /showAppMessage\(tr\('invalidParams'\), \{ kind: 'info', duration: 4500, key: 'invalid-parameters' \}\)/);
    assert.match(renderTime, /showAppMessage\(tr\('chartUnavailable'\), \{ kind: 'error', duration: 6000, key: 'chart-error' \}\)/);
    assert.doesNotMatch(main, /\$\('csv-status'\)|\$\('parameter-notice'\)|\$\('chart-error'\)/);
});

test('fatal initialization remains a persistent inline replacement state', () => {
    assert.match(index, /<div id="fatal-error" class="fatal-error" role="alert" hidden><\/div>/);
    assert.match(main, /catch \(e\) \{[\s\S]*?dismissAppMessage\(\);[\s\S]*?\$\('fatal-error'\)\.hidden = false/);
    assert.match(styles, /\.fatal-error,[\s\S]*?\.notice\s*\{/);
});

test('map contextual error is an in-stage overlay with no flow height', () => {
    const stageStart = index.indexOf('<div class="map-stage">');
    const stageEnd = index.indexOf('</div>', index.indexOf('id="map-legend"'));
    const errorIndex = index.indexOf('id="map-error"');
    assert.ok(stageStart < errorIndex && errorIndex < stageEnd);
    assert.match(index, /id="map-container"[^>]+aria-describedby="map-error"/);
    assert.match(index, /id="map-error" class="map-stage-message" role="status" aria-live="polite" aria-atomic="true" hidden/);
    const overlay = styles.match(/\.map-stage-message\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(overlay, /position: absolute/);
    assert.match(overlay, /top: \.75rem/);
    assert.match(overlay, /width: min\(360px, calc\(100% - 7\.5rem\)\)/);
    assert.match(overlay, /pointer-events: none/);
});

test('reserved map action status remains unchanged and prevents map movement', () => {
    assert.match(index, /id="map-action-status" class="map-action-status" role="status" aria-live="polite"/);
    const statusRules = [...styles.matchAll(/\.map-action-status\s*\{[\s\S]*?\n\}/g)].map(match => match[0]).join('\n');
    assert.match(statusRules, /min-height: 1\.2rem/);
});

test('notification transitions avoid layout properties and respect reduced motion', () => {
    const message = styles.match(/\.app-message\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
    assert.match(message, /opacity: 0/);
    assert.match(message, /transform: translateY\(-6px\)/);
    assert.match(message, /transition: opacity 180ms ease, transform 180ms ease/);
    assert.doesNotMatch(message, /transition:[^;]*(height|margin|padding|top|left)/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.app-message,[\s\S]*?transform: none;[\s\S]*?transition: none;/);
});

test('no transient feedback remains as an ordinary notice before dashboard content', () => {
    const beforeDashboard = index.slice(index.indexOf('<main'), index.indexOf('<div id="dashboard"'));
    assert.doesNotMatch(beforeDashboard, /class="notice"|id="loading"|id="parameter-notice"|id="area-load-status"/);
    assert.doesNotMatch(index, /id="csv-status"|id="chart-error"/);
});
