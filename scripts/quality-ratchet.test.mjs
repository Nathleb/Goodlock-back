import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { countKnipIssues, evaluateRatchet, runRatchet, isMain } from './quality-ratchet.mjs';

const entry = (file, overrides = {}) => ({
    file,
    binaries: [],
    dependencies: [],
    exports: [],
    files: [],
    types: [],
    unlisted: [],
    ...overrides,
});

test('every issue of every file counts once', () => {
    const report = {
        issues: [
            entry('src/a.ts', { exports: [{ name: 'x' }, { name: 'y' }], types: [{ name: 'T' }] }),
            entry('src/b.ts', { files: [{ name: 'src/b.ts' }] }),
            entry('package.json', { unlisted: [{ name: 'express' }] }),
        ],
    };
    assert.equal(countKnipIssues(report), 5);
});

test('a report without issues counts zero', () => {
    assert.equal(countKnipIssues({ issues: [] }), 0);
});

test('more issues than the baseline fails the ratchet', () => {
    const result = evaluateRatchet(55, 54);
    assert.equal(result.ok, false);
    assert.match(result.message, /1 more/);
});

test('as many issues as the baseline passes', () => {
    assert.equal(evaluateRatchet(54, 54).ok, true);
});

test('fewer issues than the baseline passes and asks to tighten the baseline', () => {
    const result = evaluateRatchet(50, 54);
    assert.equal(result.ok, true);
    assert.match(result.message, /tighten.*50/i);
});

test('the owners list knip adds when a CODEOWNERS file exists does not count as issues', () => {
    const report = { issues: [entry('src/a.ts', { exports: [{ name: 'x' }], owners: [{ name: '@team' }] })] };
    assert.equal(countKnipIssues(report), 1);
});

const knipOk = (issues) => () => ({ status: issues.length ? 1 : 0, stdout: JSON.stringify({ issues }), stderr: '' });
const baseline = (knipIssues) => () => ({ knipIssues });

test('the ratchet passes at the baseline and fails above it', () => {
    const one = [entry('src/a.ts', { exports: [{ name: 'x' }] })];
    assert.equal(runRatchet({ runKnip: knipOk(one), readBaseline: baseline(1) }).code, 0);
    const failed = runRatchet({ runKnip: knipOk(one), readBaseline: baseline(0) });
    assert.equal(failed.code, 1);
    assert.match(failed.message, /1 more/);
});

test('a knip run that crashed fails the gate even when it printed valid JSON', () => {
    const crashed = () => ({ status: 2, stdout: JSON.stringify({ issues: [] }), stderr: 'config failed to load' });
    const result = runRatchet({ runKnip: crashed, readBaseline: baseline(54) });
    assert.equal(result.code, 2);
    assert.match(result.message, /knip failed/);
});

test('knip that cannot be started fails the gate', () => {
    const missing = () => ({ error: new Error('spawn npx ENOENT'), stdout: '', stderr: '' });
    assert.equal(runRatchet({ runKnip: missing, readBaseline: baseline(54) }).code, 2);
});

test('output that is not JSON fails the gate', () => {
    const garbage = () => ({ status: 1, stdout: 'Unused files (1)', stderr: '' });
    assert.equal(runRatchet({ runKnip: garbage, readBaseline: baseline(54) }).code, 2);
});

test('a baseline that is not a count fails the gate instead of passing forever', () => {
    for (const bad of [undefined, 'fifty', -1, 1.5, null]) {
        const result = runRatchet({ runKnip: knipOk([]), readBaseline: () => ({ knipIssues: bad }) });
        assert.equal(result.code, 2, String(bad));
        assert.match(result.message, /knipIssues/);
    }
});

test('the script is recognised as the entry point whatever the path looks like', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ratchet dir é-'));
    const file = join(dir, 'script.mjs');
    writeFileSync(file, '');
    const link = join(dir, 'link.mjs');
    symlinkSync(file, link);
    assert.equal(isMain(pathToFileURL(file).href, file), true);
    assert.equal(isMain(pathToFileURL(file).href, link), true);
    assert.equal(isMain(pathToFileURL(file).href, join(dir, 'other.mjs')), false);
});
