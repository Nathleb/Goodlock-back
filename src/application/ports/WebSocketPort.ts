export interface WebSocketPort {
    joinRoom(socketId: string, roomId: string): void;
    leaveRoom(socketId: string, roomId: string): void;
    emitToSocket(socketId: string, event: string, data: unknown): void;
    emitToRoom(roomId: string, event: string, data: unknown): void;
}
