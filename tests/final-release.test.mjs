import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const bytes = path => readFileSync(new URL(path, import.meta.url));
const readJson = path => JSON.parse(read(path));
const sha256 = value => createHash('sha256').update(value).digest('hex');

const releaseBytes = bytes('../data/release.json');
const release = JSON.parse(releaseBytes.toString('utf8'));
const manifest = readJson('../data/payload_manifest.json');
const schema = readJson('../data/schemas/release.schema.json');
const resourcesSource = read('../src/resources.js');
const resources = (await import(`data:text/javascript;base64,${Buffer.from(resourcesSource).toString('base64')}`)).resources;
const content = read('../src/content-page.js');
const readme = read('../README.md');
const pipelineReadme = read('../pipeline/README.md');
const integration = read('../pipeline/scripts/integrate_dashboard_payloads.py');

test('active metadata declares the final public release without inventing an audit pass', () => {
    assert.equal(release.website_release_id, 'AAE-WEB-1.1.0');
    assert.equal(release.analytical_build_id, 'AAE-FULL-b8f2d318b6a6266661');
    assert.equal(release.website_release_status, 'FINAL_PUBLIC_RELEASE');
    assert.equal(release.publication_status, 'FINAL_PUBLIC_RELEASE');
    assert.equal(release.delivery.product_status, 'FINAL_PUBLIC_RELEASE');
    assert.equal(release.website_release_date, '2026-08-29');
    assert.equal(release.delivery.independent_post_correction_reaudit_required, false);
    assert.doesNotMatch(JSON.stringify(release), /INDEPENDENT_AUDIT_PASS|FINAL_ACCEPTANCE_AUDIT_PASS/);
});

test('public English and Ukrainian copy identifies the final release', () => {
    assert.equal(resources.en.translation.releaseStatus, 'Final public release');
    assert.equal(resources.uk.translation.releaseStatus, 'Фінальний публічний реліз');
    assert.match(content, /\['Status', 'Final public release'\]/);
    assert.match(content, /\['Статус', 'Фінальний публічний реліз'\]/);
    assert.doesNotMatch(content, /\['Status', 'Release candidate'\]|\['Статус', 'Кандидат на реліз'\]/);
});

test('root documentation links the live dashboard and describes the current public release', () => {
    assert.match(readme, /\*\*Live dashboard:\*\* \[https:\/\/alarms\.etheric\.dev\/\]\(https:\/\/alarms\.etheric\.dev\/\)/);
    assert.match(readme, /Website status: final public release/);
    assert.doesNotMatch(readme, /Website status: release candidate/);
    assert.match(readme, /pipeline\/evidence\/\s+Historical regression, correction and integration evidence/);
});

test('pipeline documentation separates candidate integration from explicit release promotion', () => {
    assert.match(pipelineReadme, /current public release/);
    assert.match(pipelineReadme, /future pipeline refresh is integrated as a reviewable candidate/);
    assert.match(pipelineReadme, /separate explicit promotion decision/);
    assert.doesNotMatch(pipelineReadme, /current release candidate/);
    assert.match(integration, /"website_release_status": "CANDIDATE_PENDING_INDEPENDENT_ACCEPTANCE"/);
    assert.match(integration, /"independent_post_correction_reaudit_required": True/);
});

test('manifest reconciles the changed release metadata and keeps 56 analytical identities', () => {
    assert.equal(manifest.release_id, 'AAE-WEB-1.1.0');
    assert.equal(manifest.analytical_build_id, 'AAE-FULL-b8f2d318b6a6266661');
    assert.equal(manifest.analytical_payload_count, 56);
    assert.equal(manifest.analytical_payloads.length, 56);
    const releaseEntry = manifest.files.find(entry => entry.path === 'release.json');
    assert.ok(releaseEntry);
    assert.equal(releaseEntry.size_bytes, releaseBytes.length);
    assert.equal(releaseEntry.sha256, sha256(releaseBytes));
    for (const entry of manifest.analytical_payloads) {
        const payload = bytes(`../data/${entry.path}`);
        assert.equal(payload.length, entry.size_bytes, entry.path);
        assert.equal(sha256(payload), entry.sha256, entry.path);
    }
});

test('source, analytical build and governed methodology identities remain unchanged', () => {
    assert.equal(release.analytical_source_sha256, '108954bb2bb28db064069de724fbd67a74bd2a581460bb98e59421e887780445');
    assert.equal(release.analytical_source_upstream_commit_sha, 'f3bbc50ab34a8100018f2d95f45c6ba053b0c77a');
    assert.equal(release.analytical_source_git_blob_sha1, 'c7b84747df0c434cf33d9e8d241c7554ca894168');
    assert.equal(release.methodology_version, '0.2');
    assert.equal(release.indicator_dictionary_version, '0.3');
    assert.equal(schema.properties.analytical_build_id.const, 'AAE-FULL-b8f2d318b6a6266661');
    assert.equal(schema.properties.methodology_version.const, '0.2');
    assert.equal(schema.properties.indicator_dictionary_version.const, '0.3');
});

test('historical Stage-B and Stage-E validation records remain byte-identical', () => {
    assert.equal(sha256(bytes('../data/stage_b_validation.json')), '59be198651270cffc102e86766e947d683478ef0a796713d88600d6387b7b49b');
    assert.equal(sha256(bytes('../data/stage_e_validation.json')), 'ce4d81689779f88ff473bcf9149d2e4de9cda9eecacac93625ae24404169a2a8');
    const stageE = readJson('../data/stage_e_validation.json');
    assert.equal(stageE.release_status, 'CANDIDATE_PENDING_INDEPENDENT_ACCEPTANCE');
    assert.equal(stageE.independent_post_correction_reaudit_required, true);
});
