import { Injectable, Inject } from '@nestjs/common';
import { ROOM_PORT, SESSION_PORT, WEBSOCKET_PORT, MATCH_TIMER_PORT } from '@application/ports/tokens';
import { RoomPort } from '@application/ports/RoomPort';
import { SessionPort } from '@application/ports/SessionPort';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import { MatchTimerPort } from '@application/ports/MatchTimerPort';
import { GameOverDTO } from '@application/dtos/GameState.dto';
import GameState from '@domain/types/GameState.type';
import { Room } from '@domain/types/Room.type';
import { PlayerIndex } from '@domain/types/Position.type';
import { RoomId } from '@shared/branded.types';
import { expireClocks, nextExpiry, setConnected, settleClocks } from '@domain/services/Clock.service';
import { concede } from '@domain/services/Round.service';

/**
 * What the coordinators share about the life of a match: its clocks (CLOCK-2, AWAY-2), the end of the
 * match when time runs out (CLOCK-3, AWAY-3) or a player concedes (AWAY-1), and what follows the end
 * (END-3, ROOM-6).
 */
@Injectable()
export class MatchLifecycleService {
    constructor(
        @Inject(ROOM_PORT) private readonly roomPort: RoomPort,
        @Inject(SESSION_PORT) private readonly sessionPort: SessionPort,
        @Inject(WEBSOCKET_PORT) private readonly wsPort: WebSocketPort,
        @Inject(MATCH_TIMER_PORT) private readonly timer: MatchTimerPort,
    ) {}

    /**
     * The game of a started room with its clocks settled up to `now`: the state to start every action
     * from. If a clock or a reconnection time has run out by then, the match ends instead and the
     * answer is null.
     */
    settled(room: Room, now: number = Date.now()): GameState | null {
        const gs = room.gameState as GameState;
        const expired = expireClocks(gs, now);
        if (expired.winner !== undefined && gs.winner === undefined) {
            this.finish(room.roomId, expired);
            return null;
        }
        return settleClocks(gs, now);
    }

    /** Wakes the server up at the first moment a clock or a reconnection time runs out. */
    schedule(roomId: RoomId): void {
        const gs = this.roomPort.getRoom(roomId)?.gameState;
        const expiry = gs ? nextExpiry(gs) : null;
        if (!expiry) { this.timer.cancel(roomId); return; }
        this.timer.schedule(roomId, expiry.at, () => this.expire(roomId));
    }

    expire(roomId: RoomId, now: number = Date.now()): void {
        const gs = this.roomPort.getRoom(roomId)?.gameState;
        if (!gs || gs.winner !== undefined) return;
        const ended = expireClocks(gs, now);
        if (ended.winner !== undefined) this.finish(roomId, ended);
        else this.schedule(roomId);
    }

    /** AWAY-1: the player concedes; the match ends in favour of the other. */
    concede(roomId: RoomId, playerIndex: PlayerIndex): void {
        const gs = this.roomPort.getRoom(roomId)?.gameState;
        if (!gs || gs.winner !== undefined) return;
        this.finish(roomId, concede(gs, playerIndex));
    }

    /**
     * AWAY-2: a player disconnects or comes back. Saves the game with the change and answers their
     * reconnection time left, or null when there is no game to change or the match ended first.
     */
    connectionChanged(roomId: RoomId, playerIndex: PlayerIndex, connected: boolean, now: number = Date.now()): number | null {
        const room = this.roomPort.getRoom(roomId);
        if (!room?.gameState) return null;
        const settled = this.settled(room, now);
        if (!settled) return null;
        const updated = setConnected(settled, playerIndex, connected, now);
        this.roomPort.updateGameState(roomId, updated);
        this.schedule(roomId);
        return updated.clocks[playerIndex].reconnectionMs;
    }

    /** END-3, ROOM-6: tells both players who won and why, then sends them back to the room browser. */
    finish(roomId: RoomId, gs: GameState): void {
        if (gs.winner === undefined || gs.endReason === undefined) throw new Error(`Match of room ${roomId} ended with no winner`);
        const payload: GameOverDTO = { winner: gs.winner, reason: gs.endReason };
        this.wsPort.emitToRoom(roomId, 'gameOver', payload);
        this.timer.cancel(roomId);
        const room = this.roomPort.closeRoom(roomId);
        for (const sessionId of room?.playerOrder ?? room?.playersId ?? []) {
            const session = this.sessionPort.getSessionById(sessionId);
            if (!session) continue;
            this.sessionPort.setSessionRoom(session.socketId, undefined);
            this.wsPort.leaveRoom(session.socketId, roomId);
        }
    }
}
