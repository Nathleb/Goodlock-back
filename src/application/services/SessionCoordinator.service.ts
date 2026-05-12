import { Injectable, Inject } from '@nestjs/common';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT } from '@application/ports/tokens';
import { SessionPort } from '@application/ports/SessionPort';
import { RoomPort } from '@application/ports/RoomPort';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import { RoomMapper } from '@application/mappers/RoomMapper';
import { GameStateMapper } from '@application/mappers/GameStateMapper';

@Injectable()
export class SessionCoordinatorService {
    constructor(
        @Inject(SESSION_PORT) private readonly sessionPort: SessionPort,
        @Inject(ROOM_PORT) private readonly roomPort: RoomPort,
        @Inject(WEBSOCKET_PORT) private readonly wsPort: WebSocketPort,
    ) {}

    handleConnect(socketId: string, deviceIdentifier: string): void {
        const session = this.sessionPort.createOrReconnectSession(socketId, deviceIdentifier);
        if (!session.roomId) return;
        this.wsPort.joinRoom(socketId, session.roomId);
        const room = this.roomPort.getRoom(session.roomId);
        if (!room) return;
        this.wsPort.emitToSocket(socketId, 'roomUpdated', RoomMapper.toDTO(room));
        if (room.gameState) {
            this.wsPort.emitToSocket(socketId, 'gameStateUpdated', GameStateMapper.toDTO(room.gameState));
        }
    }

    handleDisconnect(socketId: string): void {
        const session = this.sessionPort.getSession(socketId);
        if (!session) return;
        if (session.roomId) {
            const room = this.roomPort.quitRoom(session.sessionId);
            this.wsPort.leaveRoom(socketId, session.roomId);
            if (room) {
                this.wsPort.emitToRoom(session.roomId, 'roomUpdated', RoomMapper.toDTO(room));
            }
        }
        this.sessionPort.disconnectSession(socketId);
    }
}
