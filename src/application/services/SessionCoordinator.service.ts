import { Injectable, Inject } from '@nestjs/common';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT, CLAIM_CONFIG } from '@application/ports/tokens';
import { SessionPort } from '@application/ports/SessionPort';
import { RoomPort } from '@application/ports/RoomPort';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import { RoomMapper } from '@application/mappers/RoomMapper';
import { GameStateMapper } from '@application/mappers/GameStateMapper';
import { UserId } from '@shared/branded.types';
import { PlayerIndex } from '@domain/types/Position.type';
import { ClaimConfig } from '@domain/types/Claim.type';
import { resolvePlayerIndex } from '@domain/services/Room.service';
import { computeAfkClaimInMs } from '@domain/services/Claim.service';

@Injectable()
export class SessionCoordinatorService {
    constructor(
        @Inject(SESSION_PORT) private readonly sessionPort: SessionPort,
        @Inject(ROOM_PORT) private readonly roomPort: RoomPort,
        @Inject(WEBSOCKET_PORT) private readonly wsPort: WebSocketPort,
        @Inject(CLAIM_CONFIG) private readonly claimConfig: ClaimConfig,
    ) {}

    handleConnect(socketId: string, userId: UserId): void {
        const { session, evictedSocketId } = this.sessionPort.createOrReconnectSession(socketId, userId);
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
            room = this.roomPort.setPresence(room.roomId, playerIndex, true, Date.now()) ?? room;
            this.wsPort.emitToRoom(room.roomId, 'presenceChanged', { playerIndex, connected: true, claimInMs: null });
        }

        this.wsPort.emitToSocket(socketId, 'roomUpdated', RoomMapper.toDTO(room));
        if (room.gameState) {
            const dto = playerIndex !== -1
                ? GameStateMapper.toDTOForViewer(room.gameState, playerIndex as PlayerIndex)
                : GameStateMapper.toDTO(room.gameState);
            this.wsPort.emitToSocket(socketId, 'gameStateUpdated', {
                ...dto,
                afkClaimInMs: computeAfkClaimInMs(room.gameState, room.phaseStartedAt, Date.now(), this.claimConfig.afkLimitMs),
            });
        }
    }

    handleDisconnect(socketId: string): void {
        const session = this.sessionPort.getSession(socketId);
        if (!session) return;
        if (session.roomId) {
            const room = this.roomPort.getRoom(session.roomId);
            if (room?.isStarted) {
                const playerIndex = resolvePlayerIndex(room, session.sessionId);
                if (playerIndex !== -1) {
                    this.roomPort.setPresence(room.roomId, playerIndex, false, Date.now());
                    this.wsPort.emitToRoom(room.roomId, 'presenceChanged', {
                        playerIndex,
                        connected: false,
                        claimInMs: this.claimConfig.graceMs,
                    });
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
