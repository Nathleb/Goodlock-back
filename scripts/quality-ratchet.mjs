#!/usr/bin/env node
// Dead-code ratchet: knip has no threshold, so this fails when the number of issues goes above
// the one recorded in quality-baseline.json. It never edits the baseline: tightening it is a
// deliberate change, made in the commit that removes the dead code.
//
//   node scripts/quality-ratchet.mjs            (runs knip in production mode and compares)

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export function countKnipIssues(report) {
    return report.issues.reduce(
        (total, file) => total + Object.values(file).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0),
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

if (import.meta.url === `file://${process.argv[1]}`) {
    // Production mode ignores the tests, so code that only a test uses is reported as dead.
    const run = spawnSync('npx', ['knip', '--production', '--reporter', 'json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    let report;
    try {
        report = JSON.parse(run.stdout);
    } catch {
        console.error(`knip did not return JSON:\n${run.stdout}\n${run.stderr}`);
        process.exit(2);
    }
    const { knipIssues } = JSON.parse(readFileSync(new URL('../quality-baseline.json', import.meta.url), 'utf8'));
    const result = evaluateRatchet(countKnipIssues(report), knipIssues);
    console.log(result.message);
    if (!result.ok) {
        console.error('Run `npx knip --production` to see them. Remove the dead code; do not add ignore entries.');
        process.exit(1);
    }
}
