import { ok, err, Result } from '@shared/result.type';
import { unwrap, unwrapErr } from './helpers/result';

describe('Result (shared/result.type)', () => {
    it('chains checks and stops at the first error', () => {
        const check = (n: number): Result<number, string> => (n > 0 ? ok(n) : err(`not positive: ${n}`));
        expect(unwrap(check(1).andThen(n => check(n + 1)))).toBe(2);
        expect(unwrapErr(check(0).andThen(n => check(n + 1)))).toBe('not positive: 0');
    });
});

describe('test helpers unwrap and unwrapErr', () => {
    it('unwrap returns the value of an ok', () => {
        expect(unwrap(ok('v'))).toBe('v');
    });

    it('unwrap throws on an err and names the error, so a test fails with the cause', () => {
        expect(() => unwrap(err({ code: 'X' }))).toThrow(/Expected Ok.*"code":"X"/);
    });

    it('unwrapErr returns the error of an err and throws on an ok', () => {
        expect(unwrapErr(err('boom'))).toBe('boom');
        expect(() => unwrapErr(ok(1))).toThrow(/Expected Err/);
    });
});
