import { SocketId, RoomId } from '@shared/branded.types';
import { Injectable } from '@nestjs/common';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import { SharedWebSocketService } from './SharedWebSocketService';

@Injectable()
export class WebSocketService implements WebSocketPort {
    constructor(private readonly shared: SharedWebSocketService) {}

    joinRoom(socketId: SocketId, roomId: RoomId): void {
        this.shared.getServer().in(socketId).socketsJoin(roomId);
    }

    leaveRoom(socketId: SocketId, roomId: RoomId): void {
        this.shared.getServer().in(socketId).socketsLeave(roomId);
    }

    emitToSocket(socketId: SocketId, event: string, data: unknown): void {
        this.shared.getServer().to(socketId).emit(event, data);
    }

    emitToRoom(roomId: RoomId, event: string, data: unknown): void {
        this.shared.getServer().to(roomId).emit(event, data);
    }

    disconnectSocket(socketId: SocketId): void {
        this.shared.getServer().in(socketId).disconnectSockets(true);
    }
}
