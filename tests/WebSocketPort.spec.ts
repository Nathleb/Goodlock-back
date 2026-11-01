import { WebSocketPort } from '@application/ports/WebSocketPort';
import { RoomId, SocketId } from '@shared/branded.types';
import { typeErrorsOf } from './helpers/typeErrors';

const SOCKET = 's1' as SocketId;
const ROOM = 'r1' as RoomId;

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

        port.emitToSocket(SOCKET, 'error', { message: 'boom' });
        port.emitToRoom(ROOM, 'gameOver', { winner: 0, reason: 'elimination' });

        expect(port.emitToSocket).toHaveBeenCalledWith(SOCKET, 'error', { message: 'boom' });
    });

    describe('refused at compile time', () => {
        const PRELUDE = `import { WebSocketPort } from '@application/ports/WebSocketPort';
import { RoomId, SocketId } from '@shared/branded.types';
declare const port: WebSocketPort;
declare const socket: SocketId;
declare const room: RoomId;
`;
        let errors: Record<string, string[]>;

        beforeAll(() => {
            errors = typeErrorsOf({
                valid: PRELUDE + `port.emitToSocket(socket, 'error', { message: 'boom' });`,
                wrongPayload: PRELUDE + `port.emitToRoom(room, 'roundResolved', { wrong: 1 });`,
                wrongField: PRELUDE + `port.emitToSocket(socket, 'error', { message: 42 });`,
                unknownEvent: PRELUDE + `port.emitToRoom(room, 'madeUpEvent', {});`,
            });
        }, 60_000);

        it('compiles a matching event and payload', () => {
            expect(errors.valid).toEqual([]);
        });

        it('refuses a payload that does not match the event', () => {
            expect(errors.wrongPayload).toEqual([expect.stringContaining("'wrong' does not exist in type 'RoundResolvedDTO'")]);
            expect(errors.wrongField).toEqual([expect.stringContaining("Type 'number' is not assignable to type 'string'")]);
        });

        it('refuses an event the server does not send', () => {
            expect(errors.unknownEvent).toEqual([expect.stringContaining('"madeUpEvent"')]);
        });
    });
});
