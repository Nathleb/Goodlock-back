import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
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
import { domainError } from '@domain/errors/DomainError';
import { toErrorPayload } from '@application/errors/toErrorPayload';

@Injectable()
export class RoomCoordinatorService {
    private readonly logger = new Logger(RoomCoordinatorService.name);

    constructor(
        @Inject(SESSION_PORT) private readonly sessionPort: SessionPort,
        @Inject(ROOM_PORT) private readonly roomPort: RoomPort,
        @Inject(WEBSOCKET_PORT) private readonly wsPort: WebSocketPort,
        private readonly decks: DeckCoordinatorService,
    ) {}

    /** A Result error or a thrown value, as the `error { code, message }` event. */
    private emitFailure(socketId: string, error: unknown): void {
        this.wsPort.emitToSocket(socketId, 'error', toErrorPayload(error, this.logger));
    }

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
            this.emitFailure(socketId, e);
        }
    }

    joinRoom(socketId: string, roomId: string): void {
        const session = this.sessionPort.getSession(socketId);
        if (!session) return;

        try {
            if (session.roomId) {
                this.leaveCurrentRoom(socketId, session.sessionId, session.roomId);
            }
            const joined = this.roomPort.joinRoom(session.sessionId, roomId);
            if (joined.isErr()) { this.emitFailure(socketId, joined.error); return; }
            const room = joined.value;
            this.sessionPort.setSessionRoom(socketId, room.roomId);
            this.wsPort.joinRoom(socketId, room.roomId);
            this.wsPort.emitToRoom(room.roomId, 'roomUpdated', RoomMapper.toDTO(room));
        } catch (e: unknown) {
            this.emitFailure(socketId, e);
        }
    }

    quitRoom(socketId: string): void {
        const session = this.sessionPort.getSession(socketId);
        if (!session || !session.roomId) return;

        try {
            this.leaveCurrentRoom(socketId, session.sessionId, session.roomId);
        } catch (e: unknown) {
            this.emitFailure(socketId, e);
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
            this.emitFailure(socketId, domainError('NOT_IN_ROOM', 'Join a room before choosing a deck'));
            return;
        }
        try {
            const characterIds = await this.decks.getOwnDeckCharacterIds(session.userId, deckId as DeckId);
            // The world may have moved during the await: only store if the player is still in that room.
            if (this.sessionPort.getSession(socketId)?.roomId !== roomId) return;
            const selected = this.roomPort.setDeckSelection(roomId, session.sessionId, characterIds);
            if (selected.isErr()) { this.emitFailure(socketId, selected.error); return; }
            this.wsPort.emitToRoom(roomId, 'roomUpdated', RoomMapper.toDTO(selected.value));
        } catch (e: unknown) {
            // DeckCoordinator is shared with the HTTP side and throws Nest exceptions: here, a missing
            // or foreign deck is a rule the player broke, not a server failure.
            this.emitFailure(socketId, e instanceof NotFoundException ? domainError('DECK_NOT_FOUND', e.message) : e);
        }
    }
}
