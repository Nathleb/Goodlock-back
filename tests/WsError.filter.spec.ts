import { ArgumentsHost, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsErrorFilter } from '@infrastructure/adapters/websocket/filters/WsError.filter';
import { domainError } from '@domain/errors/DomainError';

const makeHost = () => {
    const emit = jest.fn();
    const host = { switchToWs: () => ({ getClient: () => ({ emit }) }) } as unknown as ArgumentsHost;
    return { host, emit };
};

describe('WsErrorFilter', () => {
    let logError: jest.SpyInstance;

    beforeEach(() => {
        logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    });
    afterEach(() => jest.restoreAllMocks());

    it('reports a plain WsException as an invalid request and logs nothing', () => {
        const { host, emit } = makeHost();
        new WsErrorFilter().catch(new WsException('property admin should not exist'), host);
        expect(emit).toHaveBeenCalledWith('error', { code: 'INVALID_REQUEST', message: 'property admin should not exist' });
        expect(logError).not.toHaveBeenCalled();
    });

    it('keeps the code of a WsException that carries one', () => {
        const { host, emit } = makeHost();
        new WsErrorFilter().catch(new WsException({ code: 'NOT_CONNECTED', message: 'Not connected' }), host);
        expect(emit).toHaveBeenCalledWith('error', { code: 'NOT_CONNECTED', message: 'Not connected' });
    });

    it('does not trust a code it does not know', () => {
        const { host, emit } = makeHost();
        new WsErrorFilter().catch(new WsException({ code: 'WHATEVER', message: 'x' }), host);
        expect(emit).toHaveBeenCalledWith('error', { code: 'INVALID_REQUEST', message: 'x' });
    });

    it('falls back to a generic message when a WsException object has no text message', () => {
        const { host, emit } = makeHost();
        new WsErrorFilter().catch(new WsException({ message: { nested: true } }), host);
        expect(emit).toHaveBeenCalledWith('error', { code: 'INVALID_REQUEST', message: 'Invalid request' });
    });

    it('reports a domain error that reached the gateway with its own code', () => {
        const { host, emit } = makeHost();
        new WsErrorFilter().catch(domainError('ROOM_FULL', 'Room is full'), host);
        expect(emit).toHaveBeenCalledWith('error', { code: 'ROOM_FULL', message: 'Room is full' });
        expect(logError).not.toHaveBeenCalled();
    });

    it('hides an unexpected error from the client and logs it on the server', () => {
        const { host, emit } = makeHost();
        const bug = new TypeError('Cannot read properties of undefined');
        new WsErrorFilter().catch(bug, host);
        expect(emit).toHaveBeenCalledWith('error', { code: 'INTERNAL', message: 'Internal error' });
        expect(logError).toHaveBeenCalledWith(bug);
    });
});
