import { SocketId, RoomId } from '@shared/branded.types';
export interface WebSocketPort {
    joinRoom(socketId: SocketId, roomId: RoomId): void;
    leaveRoom(socketId: SocketId, roomId: RoomId): void;
    emitToSocket(socketId: SocketId, event: string, data: unknown): void;
    emitToRoom(roomId: RoomId, event: string, data: unknown): void;
    disconnectSocket(socketId: SocketId): void;
}
