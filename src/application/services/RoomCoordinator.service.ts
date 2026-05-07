import { Injectable, Inject } from '@nestjs/common';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT } from '@application/ports/tokens';
import { SessionPort } from '@application/ports/SessionPort';
import { RoomPort } from '@application/ports/RoomPort';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import { RoomMapper } from '@application/mappers/RoomMapper';

@Injectable()
export class RoomCoordinatorService {
    constructor(
        @Inject(SESSION_PORT) private readonly sessionPort: SessionPort,
        @Inject(ROOM_PORT) private readonly roomPort: RoomPort,
        @Inject(WEBSOCKET_PORT) private readonly wsPort: WebSocketPort,
    ) {}

    createRoom(socketId: string): void {
        const session = this.sessionPort.getSession(socketId);
        if (!session) return;

        try {
            const room = this.roomPort.createRoom(session.sessionId);
            this.sessionPort.setSessionRoom(socketId, room.roomId);
            this.wsPort.joinRoom(socketId, room.roomId);
            this.wsPort.emitToSocket(socketId, 'roomCreated', RoomMapper.toDTO(room));
        } catch (e: unknown) {
            this.wsPort.emitToSocket(socketId, 'error', { message: (e as Error).message });
        }
    }

    joinRoom(socketId: string, roomId: string): void {
        const session = this.sessionPort.getSession(socketId);
        if (!session) return;

        try {
            const room = this.roomPort.joinRoom(session.sessionId, roomId);
            this.sessionPort.setSessionRoom(socketId, room.roomId);
            this.wsPort.joinRoom(socketId, room.roomId);
            this.wsPort.emitToRoom(room.roomId, 'roomUpdated', RoomMapper.toDTO(room));
        } catch (e: unknown) {
            this.wsPort.emitToSocket(socketId, 'error', { message: (e as Error).message });
        }
    }

    quitRoom(socketId: string): void {
        const session = this.sessionPort.getSession(socketId);
        if (!session || !session.roomId) return;

        const roomId = session.roomId;
        try {
            const updatedRoom = this.roomPort.quitRoom(session.sessionId);
            this.sessionPort.setSessionRoom(socketId, undefined);
            this.wsPort.leaveRoom(socketId, roomId);
            if (updatedRoom) {
                this.wsPort.emitToRoom(updatedRoom.roomId, 'roomUpdated', RoomMapper.toDTO(updatedRoom));
            }
        } catch (e: unknown) {
            this.wsPort.emitToSocket(socketId, 'error', { message: (e as Error).message });
        }
    }
}
