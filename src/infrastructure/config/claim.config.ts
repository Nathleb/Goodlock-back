import { ClaimConfig } from '@domain/types/Claim.type';

type EnvLike = { CLAIM_GRACE_MS?: string; CLAIM_AFK_LIMIT_MS?: string };

export function claimConfigFromEnv(env: EnvLike): ClaimConfig {
    return {
        graceMs: parseDuration(env.CLAIM_GRACE_MS, 60_000, 'CLAIM_GRACE_MS'),
        afkLimitMs: parseDuration(env.CLAIM_AFK_LIMIT_MS, 120_000, 'CLAIM_AFK_LIMIT_MS'),
    };
}

function parseDuration(raw: string | undefined, fallback: number, name: string): number {
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer of milliseconds, got: ${raw}`);
    }
    return value;
}
