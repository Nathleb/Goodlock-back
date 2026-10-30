import test from 'node:test';
import assert from 'node:assert/strict';
import { countKnipIssues, evaluateRatchet } from './quality-ratchet.mjs';

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
