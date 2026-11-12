import { Injectable, Inject } from '@nestjs/common';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT } from '@application/ports/tokens';
import { SessionPort } from '@application/ports/SessionPort';
import { RoomPort } from '@application/ports/RoomPort';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import { RoomMapper } from '@application/mappers/RoomMapper';
import { GameStateMapper } from '@application/mappers/GameStateMapper';
import { PresenceChangedDTO } from '@application/dtos/GameState.dto';
import { MatchLifecycleService } from '@application/services/MatchLifecycle.service';
import { UserId, SocketId } from '@shared/branded.types';
import { PlayerIndex } from '@domain/types/Position.type';
import { resolvePlayerIndex } from '@domain/services/Room.service';

@Injectable()
export class SessionCoordinatorService {
    constructor(
        @Inject(SESSION_PORT) private readonly sessionPort: SessionPort,
        @Inject(ROOM_PORT) private readonly roomPort: RoomPort,
        @Inject(WEBSOCKET_PORT) private readonly wsPort: WebSocketPort,
        private readonly lifecycle: MatchLifecycleService,
    ) {}

    handleConnect(socketId: SocketId, userId: UserId): void {
        const { session, evictedSocketId } = this.sessionPort.createOrReconnectSession(socketId, userId);
        // The client finds its seat (player index) by locating this id in room.players.
        this.wsPort.emitToSocket(socketId, 'sessionStarted', { sessionId: session.sessionId });
        if (evictedSocketId) {
            this.wsPort.emitToSocket(evictedSocketId, 'sessionEvicted', { reason: 'signed-in-elsewhere' });
            this.wsPort.disconnectSocket(evictedSocketId);
        }
        if (!session.roomId) return;
        this.wsPort.joinRoom(socketId, session.roomId);
        let room = this.roomPort.getRoom(session.roomId);
        if (!room) return;

        const playerIndex = resolvePlayerIndex(room, session.sessionId);
        if (room.isStarted && playerIndex !== -1) {
            // AWAY-2: the player is back, their reconnection time stops. A match that ended meanwhile has no room left.
            const reconnectionMs = this.lifecycle.connectionChanged(room.roomId, playerIndex as PlayerIndex, true);
            if (reconnectionMs === null) return;
            room = this.roomPort.getRoom(room.roomId) ?? room;
            const presence: PresenceChangedDTO = { playerIndex: playerIndex as PlayerIndex, connected: true, reconnectionMs };
            this.wsPort.emitToRoom(room.roomId, 'presenceChanged', presence);
        }

        this.wsPort.emitToSocket(socketId, 'roomUpdated', RoomMapper.toDTO(room));
        if (room.gameState && playerIndex !== -1) {
            this.wsPort.emitToSocket(socketId, 'gameStateUpdated', GameStateMapper.toDTOForViewer(room.gameState, playerIndex as PlayerIndex));
        }
    }

    handleDisconnect(socketId: SocketId): void {
        const session = this.sessionPort.getSession(socketId);
        if (!session) return;
        if (session.roomId) {
            const room = this.roomPort.getRoom(session.roomId);
            if (room?.isStarted) {
                const playerIndex = resolvePlayerIndex(room, session.sessionId);
                if (playerIndex !== -1) {
                    // AWAY-2: the player keeps their seat, their reconnection time runs.
                    const reconnectionMs = this.lifecycle.connectionChanged(room.roomId, playerIndex as PlayerIndex, false);
                    if (reconnectionMs !== null) {
                        const presence: PresenceChangedDTO = { playerIndex: playerIndex as PlayerIndex, connected: false, reconnectionMs };
                        this.wsPort.emitToRoom(room.roomId, 'presenceChanged', presence);
                    }
                }
                this.wsPort.leaveRoom(socketId, session.roomId);
            } else {
                const updatedRoom = this.roomPort.quitRoom(session.sessionId);
                this.sessionPort.setSessionRoom(socketId, undefined);
                this.wsPort.leaveRoom(socketId, session.roomId);
                if (updatedRoom) {
                    this.wsPort.emitToRoom(session.roomId, 'roomUpdated', RoomMapper.toDTO(updatedRoom));
                }
            }
        }
        this.sessionPort.disconnectSession(socketId);
    }
}
