import { Injectable, Inject } from '@nestjs/common';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT, EFFECT_FACTORY, CLAIM_CONFIG, CATALOG_PORT } from '@application/ports/tokens';
import { SessionPort } from '@application/ports/SessionPort';
import { RoomPort } from '@application/ports/RoomPort';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import { CatalogPort } from '@application/ports/CatalogPort';
import { Session } from '@application/dtos/Session.dto';
import { GameStateMapper } from '@application/mappers/GameStateMapper';
import { GameStateDTO, GameStateUpdatePayload, GameOverDTO } from '@application/dtos/GameState.dto';
import { Room } from '@domain/types/Room.type';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import { PlayerIndex, SlotIndex } from '@domain/types/Position.type';
import { Player } from '@domain/types/Player.type';
import { ClaimConfig } from '@domain/types/Claim.type';
import { assertPhase, assertNotReady, beginRollPhase, beginResultPhase } from '@domain/services/Phase.service';
import EffectFactory from '@domain/factories/EffectFactory.class';
import { createCharacterFromTemplate } from '@domain/services/CharacterGeneration.service';
import { createGameState } from '@domain/services/GameInit.service';
import { createPlayer, rearrangeTeam } from '@domain/services/Player.service';
import { isRoomReady, resolvePlayerIndex } from '@domain/services/Room.service';
import { checkWinner, endOfRound } from '@domain/services/Round.service';
import { evaluateClaim, computeAfkClaimInMs } from '@domain/services/Claim.service';
import {
    confirmPlacement, performRoll,
    confirmKeep,
    cancelPlacement as domainCancelPlacement,
    cancelKeep as domainCancelKeep,
    performResolve,
} from '@domain/services/GameLoop.service';

type GameContext = { session: Session; room: Room; playerIndex: PlayerIndex };

@Injectable()
export class GameCoordinatorService {
    constructor(
        @Inject(SESSION_PORT) private readonly sessionPort: SessionPort,
        @Inject(ROOM_PORT) private readonly roomPort: RoomPort,
        @Inject(WEBSOCKET_PORT) private readonly wsPort: WebSocketPort,
        @Inject(EFFECT_FACTORY) private readonly effectFactory: EffectFactory,
        @Inject(CLAIM_CONFIG) private readonly claimConfig: ClaimConfig,
        @Inject(CATALOG_PORT) private readonly catalogPort: CatalogPort,
    ) {}

    private getContext(socketId: string): GameContext | null {
        const session = this.sessionPort.getSession(socketId);
        if (!session?.roomId) return null;
        const room = this.roomPort.getRoom(session.roomId);
        if (!room?.gameState) return null;
        const idx = resolvePlayerIndex(room, session.sessionId);
        if (idx === -1) return null;
        return { session, room, playerIndex: idx as PlayerIndex };
    }

    private emitError(socketId: string, message: string): void {
        this.wsPort.emitToSocket(socketId, 'error', { message });
    }

    private withTimers(roomId: string, dto: GameStateDTO, gs: GameState): GameStateUpdatePayload {
        const room = this.roomPort.getRoom(roomId);
        return {
            ...dto,
            afkClaimInMs: computeAfkClaimInMs(gs, room?.phaseStartedAt, Date.now(), this.claimConfig.afkLimitMs),
        };
    }

    private resolveRound(roomId: string, gs: GameState): void {
        const { state: resolved, log } = performResolve(gs);
        let next = resolved;
        const winner = checkWinner(next);

        this.roomPort.updateGameState(roomId, next);
        this.wsPort.emitToRoom(roomId, 'roundResolved', {
            gameState: GameStateMapper.toDTO(next),
            resolveLog: GameStateMapper.resolveStepsToDTO(log),
        });

        if (winner !== null) {
            const payload: GameOverDTO = { winner, reason: 'elimination' };
            this.wsPort.emitToRoom(roomId, 'gameOver', payload);
            return;
        }
        next = performRoll(beginRollPhase(endOfRound(next)));
        this.roomPort.updateGameState(roomId, next);
        this.wsPort.emitToRoom(roomId, 'gameStateUpdated', this.withTimers(roomId, GameStateMapper.toDTO(next), next));
    }

    private doConfirm(
        socketId: string,
        ctx: GameContext,
        gs: GameState,
        domainFn: (gs: GameState, pi: PlayerIndex) => GameState,
    ): void {
        const { room, playerIndex } = ctx;
        try {
            const otherIndex = (1 - playerIndex) as PlayerIndex;
            const wasOtherReady = gs.playersReady[otherIndex];
            const confirmed = domainFn(gs, playerIndex);
            if (confirmed.phase === GamePhase.RESOLVE) {
                // Last KEEP confirm ends the input stage: resolve immediately.
                this.resolveRound(room.roomId, confirmed);
                return;
            }
            this.roomPort.updateGameState(room.roomId, confirmed);
            if (wasOtherReady) {
                this.wsPort.emitToRoom(room.roomId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTO(confirmed), confirmed));
            } else {
                // First to confirm: echo the player's own (opponent-masked) state
                // back to their socket so the client learns playersReady[self]=true
                // and flips the button to WAITING. The opponent is not notified,
                // keeping this confirm secret.
                this.wsPort.emitToSocket(socketId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTOForViewer(confirmed, playerIndex), confirmed));
            }
        } catch (e: unknown) {
            this.emitError(socketId, (e as Error).message);
        }
    }

    private shuffle<T>(arr: T[]): T[] {
        const result = [...arr];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    startGame(socketId: string): void {
        const session = this.sessionPort.getSession(socketId);
        if (!session?.roomId) return;
        const room = this.roomPort.getRoom(session.roomId);
        if (!room) return;

        try {
            if (room.ownerId !== session.sessionId) throw new Error('Only the room owner can start the game');
            if (!isRoomReady(room)) throw new Error('Room is not ready to start');

            const templates = this.shuffle([...this.catalogPort.list()]);
            if (templates.length < 10) throw new Error('Not enough character templates');

            const player0 = createPlayer(templates.slice(0, 5).map(t => createCharacterFromTemplate(t, this.effectFactory)), 0);
            const player1 = createPlayer(templates.slice(5, 10).map(t => createCharacterFromTemplate(t, this.effectFactory)), 1);
            const gameState = createGameState(player0, player1);

            this.roomPort.startGame(room.roomId, gameState);
            // Placement is secret: each player must receive their own team in real
            // order with the enemy masked. A room-wide broadcast can't differ per
            // viewer, so emit a per-viewer placement view to each player's socket.
            room.playersId.forEach((playerSessionId, idx) => {
                const playerSession = this.sessionPort.getSessionById(playerSessionId);
                if (!playerSession) return;
                const viewerIndex = idx as PlayerIndex;
                this.wsPort.emitToSocket(playerSession.socketId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTOForPlacement(gameState, viewerIndex), gameState));
            });
        } catch (e: unknown) {
            this.emitError(socketId, (e as Error).message);
        }
    }

    rearrangeTeam(socketId: string, characterIds: string[]): void {
        const ctx = this.getContext(socketId);
        if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
        const { room, playerIndex } = ctx;
        try {
            assertPhase(room.gameState, GamePhase.PLACEMENT);
            assertNotReady(room.gameState, playerIndex);
            const player = room.gameState.players[playerIndex];

            if (characterIds.length !== 5) throw new Error('Order must contain exactly 5 character IDs');
            const uniqueIds = new Set(characterIds);
            if (uniqueIds.size !== 5) throw new Error('Duplicate character IDs in order');
            const teamIds = new Set(player.team.map(c => c.id));
            if (characterIds.some(id => !teamIds.has(id))) throw new Error('Unknown character ID in order');

            const order = characterIds.map(id =>
                player.team.findIndex(c => c.id === id) as SlotIndex
            );
            const updatedPlayer = rearrangeTeam(player, order);
            const players = [...room.gameState.players] as [Player, Player];
            players[playerIndex] = updatedPlayer;
            const updatedGs = { ...room.gameState, players };
            this.roomPort.updateGameState(room.roomId, updatedGs);
            // Echo the persisted order back to the actor only: the client is
            // prop-controlled and would otherwise snap the drag back. The
            // opponent is not notified, so the arrangement stays secret.
            this.wsPort.emitToSocket(socketId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTOForPlacement(updatedGs, playerIndex), updatedGs));
        } catch (e: unknown) {
            this.emitError(socketId, (e as Error).message);
        }
    }

    confirmPlacement(socketId: string): void {
        const ctx = this.getContext(socketId);
        if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
        const { room, playerIndex } = ctx;
        try {
            const otherIndex = (1 - playerIndex) as PlayerIndex;
            const wasOtherReady = room.gameState.playersReady[otherIndex];
            let gs = confirmPlacement(room.gameState, playerIndex);
            if (wasOtherReady) {
                gs = performRoll(gs);
                this.roomPort.updateGameState(room.roomId, gs);
                this.wsPort.emitToRoom(room.roomId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTO(gs), gs));
            } else {
                this.roomPort.updateGameState(room.roomId, gs);
                this.wsPort.emitToSocket(socketId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTOForPlacement(gs, playerIndex), gs));
            }
        } catch (e: unknown) {
            this.emitError(socketId, (e as Error).message);
        }
    }

    confirmKeep(socketId: string, lockedCharacterIds: string[]): void {
        const ctx = this.getContext(socketId);
        if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
        const { room, playerIndex } = ctx;
        const player = room.gameState.players[playerIndex];
        const teamIds = new Set(player.team.map(c => c.id));
        for (const id of lockedCharacterIds) {
            if (!teamIds.has(id)) { this.emitError(socketId, `Unknown character id: ${id}`); return; }
        }
        const lockedSet = new Set(lockedCharacterIds);
        const updatedPlayer: Player = {
            ...player,
            team: player.team.map(c => ({ ...c, isFaceLocked: lockedSet.has(c.id) })),
        };
        const players = [...room.gameState.players] as [Player, Player];
        players[playerIndex] = updatedPlayer;
        const gsWithLocks: GameState = { ...room.gameState, players };
        this.doConfirm(socketId, ctx, gsWithLocks, confirmKeep);
    }

    cancelPlacement(socketId: string): void {
        const ctx = this.getContext(socketId);
        if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
        const { room, playerIndex } = ctx;
        try {
            const gs = domainCancelPlacement(room.gameState, playerIndex);
            if (gs !== room.gameState) {
                this.roomPort.updateGameState(room.roomId, gs);
                this.wsPort.emitToSocket(socketId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTOForPlacement(gs, playerIndex), gs));
            }
        } catch (e: unknown) {
            this.emitError(socketId, (e as Error).message);
        }
    }

    cancelKeep(socketId: string): void {
        const ctx = this.getContext(socketId);
        if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
        const { room, playerIndex } = ctx;
        try {
            const gs = domainCancelKeep(room.gameState, playerIndex);
            if (gs !== room.gameState) this.roomPort.updateGameState(room.roomId, gs);
        } catch (e: unknown) {
            this.emitError(socketId, (e as Error).message);
        }
    }

    claimVictory(socketId: string): void {
        const ctx = this.getContext(socketId);
        if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
        const { room, playerIndex } = ctx;
        try {
            const opponentIndex = (1 - playerIndex) as PlayerIndex;
            const opponentPresence = room.presence?.[opponentIndex];
            if (!opponentPresence) { this.emitError(socketId, 'Action not available'); return; }

            const verdict = evaluateClaim(
                room.gameState, playerIndex, opponentPresence, room.phaseStartedAt, Date.now(), this.claimConfig,
            );
            if (verdict.valid === false) { this.emitError(socketId, verdict.error); return; }

            this.roomPort.updateGameState(room.roomId, beginResultPhase(room.gameState));
            const payload: GameOverDTO = { winner: playerIndex, reason: verdict.reason };
            this.wsPort.emitToRoom(room.roomId, 'gameOver', payload);
        } catch (e: unknown) {
            this.emitError(socketId, (e as Error).message);
        }
    }
}
