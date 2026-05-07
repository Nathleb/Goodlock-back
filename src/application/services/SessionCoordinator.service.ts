import { Injectable, Inject } from '@nestjs/common';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT } from '@application/ports/tokens';
import { SessionPort } from '@application/ports/SessionPort';
import { RoomPort } from '@application/ports/RoomPort';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import { RoomMapper } from '@application/mappers/RoomMapper';

@Injectable()
export class SessionCoordinatorService {
    constructor(
        @Inject(SESSION_PORT) private readonly sessionPort: SessionPort,
        @Inject(ROOM_PORT) private readonly roomPort: RoomPort,
        @Inject(WEBSOCKET_PORT) private readonly wsPort: WebSocketPort,
    ) {}

    handleConnect(socketId: string, deviceIdentifier: string): void {
        const session = this.sessionPort.createOrReconnectSession(socketId, deviceIdentifier);
        if (session.roomId) {
            this.wsPort.joinRoom(socketId, session.roomId);
        }
    }

    handleDisconnect(socketId: string): void {
        const session = this.sessionPort.getSession(socketId);
        if (!session) return;

        if (session.roomId) {
            const updatedRoom = this.roomPort.quitRoom(session.sessionId);
            this.wsPort.leaveRoom(socketId, session.roomId);
            if (updatedRoom) {
                this.wsPort.emitToRoom(updatedRoom.roomId, 'roomUpdated', RoomMapper.toDTO(updatedRoom));
            }
        }

        this.sessionPort.disconnectSession(socketId);
    }
}
