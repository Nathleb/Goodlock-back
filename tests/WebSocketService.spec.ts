import { WebSocketService } from '@infrastructure/adapters/websocket/services/WebSocketService';
import { SharedWebSocketService } from '@infrastructure/adapters/websocket/services/SharedWebSocketService';

const makeService = () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const shared = { getServer: () => ({ to }) } as unknown as SharedWebSocketService;
    return { service: new WebSocketService(shared), to, emit };
};

describe('WebSocketService', () => {
    it('sends a typed event to one socket', () => {
        const { service, to, emit } = makeService();

        service.emitToSocket('s1', 'error', { message: 'boom' });

        expect(to).toHaveBeenCalledWith('s1');
        expect(emit).toHaveBeenCalledWith('error', { message: 'boom' });
    });

    it('sends a typed event to a room', () => {
        const { service, to, emit } = makeService();

        service.emitToRoom('r1', 'sessionStarted', { sessionId: 'abc' });

        expect(to).toHaveBeenCalledWith('r1');
        expect(emit).toHaveBeenCalledWith('sessionStarted', { sessionId: 'abc' });
    });

    it('refuses an event or payload outside ServerEvents', () => {
        const { service } = makeService();

        // @ts-expect-error not a ServerEvents key
        service.emitToRoom('r1', 'madeUpEvent', {});
        // @ts-expect-error error carries a message string
        service.emitToSocket('s1', 'error', { message: 42 });
    });
});
