#!/usr/bin/env node
// Dead-code ratchet: knip has no threshold, so this fails when the number of issues goes above
// the one recorded in quality-baseline.json. It never edits the baseline: tightening it is a
// deliberate change, made in the commit that removes the dead code.
//
//   node scripts/quality-ratchet.mjs            (runs knip in production mode and compares)
//
// Exit codes: 0 within the baseline, 1 above it, 2 when the check itself could not run
// (knip crashed or printed no JSON, the baseline is not a count).

import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Keys of a knip row that are not issues: the file name, and the owners knip adds when a CODEOWNERS file exists.
const NOT_ISSUES = new Set(['file', 'owners']);

export function countKnipIssues(report) {
    return report.issues.reduce(
        (total, row) =>
            total + Object.entries(row).reduce((n, [key, value]) => n + (!NOT_ISSUES.has(key) && Array.isArray(value) ? value.length : 0), 0),
        0,
    );
}

export function evaluateRatchet(count, baseline) {
    if (count > baseline) {
        return { ok: false, message: `${count - baseline} more dead-code issues than the baseline (${count} > ${baseline}).` };
    }
    if (count < baseline) {
        return { ok: true, message: `${count} issues, below the baseline ${baseline}: tighten knipIssues to ${count} in quality-baseline.json.` };
    }
    return { ok: true, message: `${count} issues, equal to the baseline.` };
}

/** knip exits 1 when it found issues; any other failure means the numbers cannot be trusted. */
export function runRatchet({ runKnip, readBaseline }) {
    const run = runKnip();
    if (run.error || (run.status !== 0 && run.status !== 1)) {
        const reason = run.error?.message ?? `exit code ${run.status}: ${run.stderr}`;
        return { code: 2, message: `knip failed, the dead-code count cannot be trusted (${reason}).` };
    }
    let report;
    try {
        report = JSON.parse(run.stdout);
    } catch {
        return { code: 2, message: `knip did not return JSON:\n${run.stdout}\n${run.stderr}` };
    }
    const { knipIssues } = readBaseline();
    if (!Number.isInteger(knipIssues) || knipIssues < 0) {
        return { code: 2, message: `quality-baseline.json needs knipIssues to be a non-negative integer, got ${JSON.stringify(knipIssues)}.` };
    }
    const result = evaluateRatchet(countKnipIssues(report), knipIssues);
    return { code: result.ok ? 0 : 1, message: result.message };
}

/** True when the module is being run as `node <file>`, even from a path with spaces, accents or symlinks. */
export function isMain(metaUrl, argv1) {
    try {
        return fileURLToPath(metaUrl) === realpathSync(argv1);
    } catch {
        return false;
    }
}

if (isMain(import.meta.url, process.argv[1] ?? '')) {
    const { code, message } = runRatchet({
        // Production mode ignores the tests, so code that only a test uses is reported as dead.
        runKnip: () => spawnSync('npx', ['knip', '--production', '--reporter', 'json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
        readBaseline: () => JSON.parse(readFileSync(new URL('../quality-baseline.json', import.meta.url), 'utf8')),
    });
    console.log(message);
    if (code === 1) console.error('Run `npx knip --production` to see them. Remove the dead code; do not add ignore entries.');
    process.exit(code);
}
