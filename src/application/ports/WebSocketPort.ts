import { SocketId, RoomId } from '@shared/branded.types';
import { ServerEvents } from '@application/dtos/Protocol.dto';

export interface WebSocketPort {
    joinRoom(socketId: SocketId, roomId: RoomId): void;
    leaveRoom(socketId: SocketId, roomId: RoomId): void;
    emitToSocket<E extends keyof ServerEvents>(socketId: SocketId, event: E, data: ServerEvents[E]): void;
    emitToRoom<E extends keyof ServerEvents>(roomId: RoomId, event: E, data: ServerEvents[E]): void;
    disconnectSocket(socketId: SocketId): void;
}
