import { Injectable, Inject } from '@nestjs/common';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT } from '@application/ports/tokens';
import { SessionPort } from '@application/ports/SessionPort';
import { RoomPort } from '@application/ports/RoomPort';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import { RoomMapper } from '@application/mappers/RoomMapper';
import GamePhase from '@domain/types/GamePhase.type';
import { beginResultPhase } from '@domain/services/Phase.service';
import { resolvePlayerIndex } from '@domain/services/Room.service';
import { GameOverDTO } from '@application/dtos/GameState.dto';
import { DeckCoordinatorService } from '@application/services/DeckCoordinator.service';
import { DeckId } from '@shared/branded.types';

@Injectable()
export class RoomCoordinatorService {
    constructor(
        @Inject(SESSION_PORT) private readonly sessionPort: SessionPort,
        @Inject(ROOM_PORT) private readonly roomPort: RoomPort,
        @Inject(WEBSOCKET_PORT) private readonly wsPort: WebSocketPort,
        private readonly decks: DeckCoordinatorService,
    ) {}

    private leaveCurrentRoom(socketId: string, sessionId: string, roomId: string): void {
        const room = this.roomPort.getRoom(roomId);
        if (room?.isStarted && room.gameState && room.gameState.phase !== GamePhase.RESULT) {
            const quitterIndex = resolvePlayerIndex(room, sessionId);
            if (quitterIndex !== -1) {
                const winner = (1 - quitterIndex) as 0 | 1;
                this.roomPort.updateGameState(roomId, beginResultPhase(room.gameState));
                // Mark the quitter gone so the janitor's "all players disconnected" rule can fire.
                this.roomPort.setPresence(roomId, quitterIndex, false, Date.now());
                const payload: GameOverDTO = { winner, reason: 'concede' };
                this.wsPort.emitToRoom(roomId, 'gameOver', payload);
            }
        }
        const updatedRoom = this.roomPort.quitRoom(sessionId);
        this.sessionPort.setSessionRoom(socketId, undefined);
        this.wsPort.leaveRoom(socketId, roomId);
        if (updatedRoom) {
            this.wsPort.emitToRoom(updatedRoom.roomId, 'roomUpdated', RoomMapper.toDTO(updatedRoom));
        }
    }

    createRoom(socketId: string): void {
        const session = this.sessionPort.getSession(socketId);
        if (!session) return;

        try {
            if (session.roomId) {
                this.leaveCurrentRoom(socketId, session.sessionId, session.roomId);
            }
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
            if (session.roomId) {
                this.leaveCurrentRoom(socketId, session.sessionId, session.roomId);
            }
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

        try {
            this.leaveCurrentRoom(socketId, session.sessionId, session.roomId);
        } catch (e: unknown) {
            this.wsPort.emitToSocket(socketId, 'error', { message: (e as Error).message });
        }
    }

    /**
     * Lobby: the player picks the deck they will bring. The deck is read from the database (the only
     * await on the WebSocket path) and snapshotted in the in-memory room, so the game itself stays sync.
     */
    async selectDeck(socketId: string, deckId: string): Promise<void> {
        const session = this.sessionPort.getSession(socketId);
        if (!session) return;
        const roomId = session.roomId;
        if (!roomId) {
            this.wsPort.emitToSocket(socketId, 'error', { message: 'Join a room before choosing a deck' });
            return;
        }
        try {
            const characterIds = await this.decks.getOwnDeckCharacterIds(session.userId, deckId as DeckId);
            // The world may have moved during the await: only store if the player is still in that room.
            if (this.sessionPort.getSession(socketId)?.roomId !== roomId) return;
            const room = this.roomPort.setDeckSelection(roomId, session.sessionId, characterIds);
            this.wsPort.emitToRoom(roomId, 'roomUpdated', RoomMapper.toDTO(room));
        } catch (e: unknown) {
            this.wsPort.emitToSocket(socketId, 'error', { message: (e as Error).message });
        }
    }
}
