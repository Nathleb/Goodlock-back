import { toErrorPayload } from '@application/errors/toErrorPayload';
import { domainError } from '@domain/errors/DomainError';

const logger = { error: jest.fn() };

beforeEach(() => jest.clearAllMocks());

describe('toErrorPayload', () => {
    it('reports a domain error with its code and message, without logging', () => {
        const payload = toErrorPayload(domainError('ROOM_FULL', 'Room is full'), logger);
        expect(payload).toEqual({ code: 'ROOM_FULL', message: 'Room is full' });
        expect(logger.error).not.toHaveBeenCalled();
    });

    it('reports a thrown bug as INTERNAL, hides its message and logs it', () => {
        const bug = new TypeError('Cannot read properties of undefined');
        const payload = toErrorPayload(bug, logger);
        expect(payload).toEqual({ code: 'INTERNAL', message: 'Internal error' });
        expect(logger.error).toHaveBeenCalledWith(bug);
    });

    it('does not let a thrown object pass for a domain error just by carrying a code', () => {
        const spoof = { code: 'INTERNAL', message: 'x' };
        expect(toErrorPayload(spoof, logger)).toEqual({ code: 'INTERNAL', message: 'Internal error' });
        expect(logger.error).toHaveBeenCalledWith(spoof);
    });

    it('reports a thrown non-Error value as INTERNAL', () => {
        expect(toErrorPayload('oops', logger)).toEqual({ code: 'INTERNAL', message: 'Internal error' });
        expect(logger.error).toHaveBeenCalledWith('oops');
    });
});
