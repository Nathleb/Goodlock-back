import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT } from '@application/ports/tokens';
import { SessionPort } from '@application/ports/SessionPort';
import { RoomPort } from '@application/ports/RoomPort';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import { RoomMapper } from '@application/mappers/RoomMapper';
import { PlayerIndex } from '@domain/types/Position.type';
import { MatchLifecycleService } from '@application/services/MatchLifecycle.service';
import { resolvePlayerIndex } from '@domain/services/Room.service';
import { DeckCoordinatorService } from '@application/services/DeckCoordinator.service';
import { DeckId, SocketId, SessionId, RoomId } from '@shared/branded.types';
import { DomainError, domainError } from '@domain/errors/DomainError';
import { Room } from '@domain/types/Room.type';
import { Result, ok } from '@shared/result.type';
import { toErrorPayload } from '@application/errors/toErrorPayload';

@Injectable()
export class RoomCoordinatorService {
    private readonly logger = new Logger(RoomCoordinatorService.name);

    constructor(
        @Inject(SESSION_PORT) private readonly sessionPort: SessionPort,
        @Inject(ROOM_PORT) private readonly roomPort: RoomPort,
        @Inject(WEBSOCKET_PORT) private readonly wsPort: WebSocketPort,
        private readonly decks: DeckCoordinatorService,
        private readonly lifecycle: MatchLifecycleService,
    ) {}

    /** A Result error or a thrown value, as the `error { code, message }` event. */
    private emitFailure(socketId: SocketId, error: unknown): void {
        this.wsPort.emitToSocket(socketId, 'error', toErrorPayload(error, this.logger));
    }

    private leaveCurrentRoom(socketId: SocketId, sessionId: SessionId, roomId: RoomId): void {
        const room = this.roomPort.getRoom(roomId);
        if (room?.isStarted && room.gameState) {
            // AWAY-1: leaving a match in progress is a concession.
            const quitterIndex = resolvePlayerIndex(room, sessionId);
            if (quitterIndex !== -1) this.lifecycle.concede(roomId, quitterIndex as PlayerIndex);
        }
        const updatedRoom = this.roomPort.quitRoom(sessionId);
        this.sessionPort.setSessionRoom(socketId, undefined);
        this.wsPort.leaveRoom(socketId, roomId);
        if (updatedRoom) {
            this.wsPort.emitToRoom(updatedRoom.roomId, 'roomUpdated', RoomMapper.toDTO(updatedRoom));
        }
    }

    createRoom(socketId: SocketId): void {
        this.enterRoom(socketId, sessionId => ok(this.roomPort.createRoom(sessionId)),
            room => this.wsPort.emitToSocket(socketId, 'roomCreated', RoomMapper.toDTO(room)));
    }

    joinRoom(socketId: SocketId, roomId: RoomId): void {
        this.enterRoom(socketId, sessionId => this.roomPort.joinRoom(sessionId, roomId),
            room => this.wsPort.emitToRoom(room.roomId, 'roomUpdated', RoomMapper.toDTO(room)));
    }

    /** Leaves the current room if any, enters the one `enter` gives, then lets `announce` tell the clients. */
    private enterRoom(
        socketId: SocketId,
        enter: (sessionId: SessionId) => Result<Room, DomainError>,
        announce: (room: Room) => void,
    ): void {
        const session = this.sessionPort.getSession(socketId);
        if (!session) return;

        try {
            if (session.roomId) {
                this.leaveCurrentRoom(socketId, session.sessionId, session.roomId);
            }
            const entered = enter(session.sessionId);
            if (entered.isErr()) { this.emitFailure(socketId, entered.error); return; }
            const room = entered.value;
            this.sessionPort.setSessionRoom(socketId, room.roomId);
            this.wsPort.joinRoom(socketId, room.roomId);
            announce(room);
        } catch (e: unknown) {
            this.emitFailure(socketId, e);
        }
    }

    quitRoom(socketId: SocketId): void {
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
    async selectDeck(socketId: SocketId, deckId: DeckId): Promise<void> {
        const session = this.sessionPort.getSession(socketId);
        if (!session) return;
        const roomId = session.roomId;
        if (!roomId) {
            this.emitFailure(socketId, domainError('NOT_IN_ROOM', 'Join a room before choosing a deck'));
            return;
        }
        try {
            const characterIds = await this.decks.getOwnDeckCharacterIds(session.userId, deckId);
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
