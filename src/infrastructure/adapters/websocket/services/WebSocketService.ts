import { SocketId, RoomId } from '@shared/branded.types';
import { Injectable } from '@nestjs/common';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import { ServerEvents } from '@application/dtos/Protocol.dto';
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

    emitToSocket<E extends keyof ServerEvents>(socketId: SocketId, event: E, data: ServerEvents[E]): void {
        this.shared.getServer().to(socketId).emit(event, data);
    }

    emitToRoom<E extends keyof ServerEvents>(roomId: RoomId, event: E, data: ServerEvents[E]): void {
        this.shared.getServer().to(roomId).emit(event, data);
    }

    disconnectSocket(socketId: SocketId): void {
        this.shared.getServer().in(socketId).disconnectSockets(true);
    }
}
