import { WebSocketPort } from '@application/ports/WebSocketPort';

const makePort = (): WebSocketPort => ({
    joinRoom: jest.fn(),
    leaveRoom: jest.fn(),
    emitToSocket: jest.fn(),
    emitToRoom: jest.fn(),
    disconnectSocket: jest.fn(),
});

describe('WebSocketPort typing', () => {
    it('accepts an event with its own payload', () => {
        const port = makePort();

        port.emitToSocket('s1', 'error', { message: 'boom' });
        port.emitToRoom('r1', 'gameOver', { winner: 0, reason: 'elimination' });

        expect(port.emitToSocket).toHaveBeenCalledWith('s1', 'error', { message: 'boom' });
    });

    it('refuses a payload that does not match the event', () => {
        const port = makePort();

        // @ts-expect-error roundResolved needs gameState and resolveLog
        port.emitToRoom('r1', 'roundResolved', { wrong: 1 });
        // @ts-expect-error error carries a message string
        port.emitToSocket('s1', 'error', { message: 42 });

        expect(port.emitToRoom).toHaveBeenCalledTimes(1);
    });

    it('refuses an event the server does not send', () => {
        const port = makePort();

        // @ts-expect-error not a ServerEvents key
        port.emitToRoom('r1', 'madeUpEvent', {});

        expect(port.emitToRoom).toHaveBeenCalledTimes(1);
    });
});
