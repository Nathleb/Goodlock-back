import { WebSocketService } from '@infrastructure/adapters/websocket/services/WebSocketService';
import { SharedWebSocketService } from '@infrastructure/adapters/websocket/services/SharedWebSocketService';
import { RoomId, SocketId } from '@shared/branded.types';

const SOCKET = 's1' as SocketId;
const ROOM = 'r1' as RoomId;

const makeService = () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    const shared = { getServer: () => ({ to }) } as unknown as SharedWebSocketService;
    return { service: new WebSocketService(shared), to, emit };
};

describe('WebSocketService', () => {
    it('sends a typed event to one socket', () => {
        const { service, to, emit } = makeService();

        service.emitToSocket(SOCKET, 'error', { message: 'boom' });

        expect(to).toHaveBeenCalledWith(SOCKET);
        expect(emit).toHaveBeenCalledWith('error', { message: 'boom' });
    });

    it('sends a typed event to a room', () => {
        const { service, to, emit } = makeService();

        service.emitToRoom(ROOM, 'sessionStarted', { sessionId: 'abc' });

        expect(to).toHaveBeenCalledWith(ROOM);
        expect(emit).toHaveBeenCalledWith('sessionStarted', { sessionId: 'abc' });
    });

    it('refuses an event or payload outside ServerEvents', () => {
        const { service } = makeService();

        // @ts-expect-error not a ServerEvents key
        service.emitToRoom(ROOM, 'madeUpEvent', {});
        // @ts-expect-error error carries a message string
        service.emitToSocket(SOCKET, 'error', { message: 42 });
    });
});
