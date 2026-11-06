import { WebSocketService } from '@infrastructure/adapters/websocket/services/WebSocketService';
import { SharedWebSocketService } from '@infrastructure/adapters/websocket/services/SharedWebSocketService';
import { RoomId, SocketId } from '@shared/branded.types';
import { typeErrorsOf } from './helpers/typeErrors';

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

        service.emitToSocket(SOCKET, 'error', { code: 'INTERNAL', message: 'boom' });

        expect(to).toHaveBeenCalledWith(SOCKET);
        expect(emit).toHaveBeenCalledWith('error', { code: 'INTERNAL', message: 'boom' });
    });

    it('sends a typed event to a room', () => {
        const { service, to, emit } = makeService();

        service.emitToRoom(ROOM, 'sessionStarted', { sessionId: 'abc' });

        expect(to).toHaveBeenCalledWith(ROOM);
        expect(emit).toHaveBeenCalledWith('sessionStarted', { sessionId: 'abc' });
    });

    it('refuses an event or payload outside ServerEvents', () => {
        const prelude = `import { WebSocketService } from '@infrastructure/adapters/websocket/services/WebSocketService';
import { RoomId, SocketId } from '@shared/branded.types';
declare const service: WebSocketService;
declare const socket: SocketId;
declare const room: RoomId;
`;

        const errors = typeErrorsOf({
            valid: prelude + `service.emitToSocket(socket, 'error', { code: 'INTERNAL', message: 'boom' });`,
            unknownEvent: prelude + `service.emitToRoom(room, 'madeUpEvent', {});`,
            wrongField: prelude + `service.emitToSocket(socket, 'error', { code: 'INTERNAL', message: 42 });`,
        });

        expect(errors.valid).toEqual([]);
        expect(errors.unknownEvent).toEqual([expect.stringContaining('"madeUpEvent"')]);
        expect(errors.wrongField).toEqual([expect.stringContaining("Type 'number' is not assignable to type 'string'")]);
    }, 60_000);
});
