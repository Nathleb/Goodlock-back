import { ArgumentsHost, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsErrorFilter } from '@infrastructure/adapters/websocket/filters/WsError.filter';

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

    it('sends the message of a WsException and logs nothing', () => {
        const { host, emit } = makeHost();
        new WsErrorFilter().catch(new WsException('Not connected'), host);
        expect(emit).toHaveBeenCalledWith('error', { message: 'Not connected' });
        expect(logError).not.toHaveBeenCalled();
    });

    it('sends the message field of a WsException built from an object', () => {
        const { host, emit } = makeHost();
        new WsErrorFilter().catch(new WsException({ message: 'bad payload' }), host);
        expect(emit).toHaveBeenCalledWith('error', { message: 'bad payload' });
    });

    it('falls back to a generic message when a WsException object has no text message', () => {
        const { host, emit } = makeHost();
        new WsErrorFilter().catch(new WsException({ message: { nested: true } }), host);
        expect(emit).toHaveBeenCalledWith('error', { message: 'Invalid request' });
    });

    it('hides an unexpected error from the client and logs it on the server', () => {
        const { host, emit } = makeHost();
        const bug = new TypeError('Cannot read properties of undefined');
        new WsErrorFilter().catch(bug, host);
        expect(emit).toHaveBeenCalledWith('error', { message: 'Internal error' });
        expect(logError).toHaveBeenCalledWith(bug);
    });
});
