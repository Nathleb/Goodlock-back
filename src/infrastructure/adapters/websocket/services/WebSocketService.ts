import { Injectable } from '@nestjs/common';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import { SharedWebSocketService } from './SharedWebSocketService';

@Injectable()
export class WebSocketService implements WebSocketPort {
    constructor(private readonly shared: SharedWebSocketService) {}

    joinRoom(socketId: string, roomId: string): void {
        this.shared.getServer().in(socketId).socketsJoin(roomId);
    }

    leaveRoom(socketId: string, roomId: string): void {
        this.shared.getServer().in(socketId).socketsLeave(roomId);
    }

    emitToSocket(socketId: string, event: string, data: unknown): void {
        this.shared.getServer().to(socketId).emit(event, data);
    }

    emitToRoom(roomId: string, event: string, data: unknown): void {
        this.shared.getServer().to(roomId).emit(event, data);
    }
}
