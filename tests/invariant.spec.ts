import { invariant } from '@application/errors/invariant';
import { domainError } from '@domain/errors/DomainError';
import { ok, err } from '@shared/result.type';

describe('invariant', () => {
    it('returns the value of an ok', () => {
        expect(invariant(ok('state'))).toBe('state');
    });

    it('throws a plain Error naming the broken rule when the step failed, so it is logged and never shown as a player error', () => {
        const failed = err(domainError('WRONG_PHASE', 'Expected phase ROLL, got KEEP'));
        expect(() => invariant(failed)).toThrow(new Error('Broken invariant (WRONG_PHASE): Expected phase ROLL, got KEEP'));
    });
});
