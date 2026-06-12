import { claimConfigFromEnv } from '@infrastructure/config/claim.config';

describe('claimConfigFromEnv', () => {
    it('uses defaults when unset', () => {
        expect(claimConfigFromEnv({})).toEqual({ graceMs: 60_000, afkLimitMs: 120_000 });
    });

    it('parses overrides', () => {
        expect(claimConfigFromEnv({ CLAIM_GRACE_MS: '30000', CLAIM_AFK_LIMIT_MS: '90000' })).toEqual({
            graceMs: 30_000,
            afkLimitMs: 90_000,
        });
    });

    it('fails fast on garbage values', () => {
        expect(() => claimConfigFromEnv({ CLAIM_GRACE_MS: 'soon' })).toThrow(/CLAIM_GRACE_MS/);
        expect(() => claimConfigFromEnv({ CLAIM_AFK_LIMIT_MS: '-5' })).toThrow(/CLAIM_AFK_LIMIT_MS/);
    });
});
