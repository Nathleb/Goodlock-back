import { domainError, isDomainError } from '@domain/errors/DomainError';

describe('domainError', () => {
    it('builds an error value with a code and a message', () => {
        expect(domainError('ROOM_FULL', 'Room is full')).toEqual({ code: 'ROOM_FULL', message: 'Room is full' });
    });

    it('is immutable', () => {
        const error = domainError('ROOM_FULL', 'Room is full');
        expect(Object.isFrozen(error)).toBe(true);
    });
});

describe('isDomainError', () => {
    it('recognizes a domain error', () => {
        expect(isDomainError(domainError('WRONG_PHASE', 'Expected phase KEEP'))).toBe(true);
    });

    it('rejects an Error, whatever its message', () => {
        expect(isDomainError(new Error('Room is full'))).toBe(false);
    });

    it('rejects an object whose code is not a domain code, so a bug cannot pass for a rule violation', () => {
        expect(isDomainError({ code: 'INTERNAL', message: 'x' })).toBe(false);
        expect(isDomainError({ code: 'NOPE', message: 'x' })).toBe(false);
    });

    it('rejects values that are not objects with a text message', () => {
        expect(isDomainError(undefined)).toBe(false);
        expect(isDomainError('ROOM_FULL')).toBe(false);
        expect(isDomainError({ code: 'ROOM_FULL' })).toBe(false);
    });
});
