import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class WebSocketService {
    private server: Server;

    setServer(server: Server) {
        this.server = server;
    }

    joinRoom(socketId: string, roomId: string) {
        this.server.in(socketId).socketsJoin(roomId);
    }

    leaveRoom(socketId: string, roomId: string) {
        this.server.in(socketId).socketsLeave(roomId);
    }

    emitToSocket(socketId: string, event: string, data: unknown) {
        this.server.in(socketId).emit(event, data);
    }

    emitToRoom(roomId: string, event: string, data: unknown) {
        this.server.in(roomId).emit(event, data);
    }
}
