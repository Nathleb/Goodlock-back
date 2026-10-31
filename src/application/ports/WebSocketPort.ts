import { SocketId } from '@shared/branded.types';
export interface WebSocketPort {
    joinRoom(socketId: SocketId, roomId: string): void;
    leaveRoom(socketId: SocketId, roomId: string): void;
    emitToSocket(socketId: SocketId, event: string, data: unknown): void;
    emitToRoom(roomId: string, event: string, data: unknown): void;
    disconnectSocket(socketId: SocketId): void;
}
