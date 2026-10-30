import { Injectable, Inject, Logger } from '@nestjs/common';
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
import { PlayerIndex } from '@domain/types/Position.type';
import { Player } from '@domain/types/Player.type';
import { ClaimConfig } from '@domain/types/Claim.type';
import { checkPhase, checkNotReady, beginRollPhase, beginResultPhase } from '@domain/services/Phase.service';
import { toErrorPayload } from '@application/errors/toErrorPayload';
import { domainError, DomainError } from '@domain/errors/DomainError';
import { invariant } from '@application/errors/invariant';
import { Result, ok, err } from '@shared/result.type';
import EffectFactory from '@domain/factories/EffectFactory.class';
import { placeTeam } from '@domain/services/Player.service';
import { isRoomReady, resolvePlayerIndex, selectedDecks } from '@domain/services/Room.service';
import { checkWinner, endOfRound } from '@domain/services/Round.service';
import { upkeep } from '@domain/services/Upkeep.service';
import { evaluateClaim, computeAfkClaimInMs } from '@domain/services/Claim.service';
import {
    confirmPlacement, performRoll,
    confirmKeep,
    cancelPlacement as domainCancelPlacement,
    cancelKeep as domainCancelKeep,
    performResolve,
    createSelectionState,
    confirmSelection as domainConfirmSelection,
    cancelSelection as domainCancelSelection,
} from '@domain/services/GameLoop.service';
import { createCharacterFromTemplate } from '@domain/services/CharacterGeneration.service';
import CharacterTemplate from '@domain/types/CharacterTemplate.type';
import { CatalogId } from '@shared/branded.types';

type GameContext = { session: Session; room: Room; playerIndex: PlayerIndex };

@Injectable()
export class GameCoordinatorService {
    private readonly logger = new Logger(GameCoordinatorService.name);

    constructor(
        @Inject(SESSION_PORT) private readonly sessionPort: SessionPort,
        @Inject(ROOM_PORT) private readonly roomPort: RoomPort,
        @Inject(WEBSOCKET_PORT) private readonly wsPort: WebSocketPort,
        @Inject(EFFECT_FACTORY) private readonly effectFactory: EffectFactory,
        @Inject(CLAIM_CONFIG) private readonly claimConfig: ClaimConfig,
        @Inject(CATALOG_PORT) private readonly catalogPort: CatalogPort,
    ) {}

    private getContext(socketId: string): Result<GameContext, DomainError> {
        const unavailable = err(domainError('ACTION_NOT_AVAILABLE', 'Action not available'));
        const session = this.sessionPort.getSession(socketId);
        if (!session?.roomId) return unavailable;
        const room = this.roomPort.getRoom(session.roomId);
        if (!room?.gameState) return unavailable;
        const idx = resolvePlayerIndex(room, session.sessionId);
        if (idx === -1) return unavailable;
        return ok({ session, room, playerIndex: idx as PlayerIndex });
    }

    /** A Result error or a thrown value, as the `error { code, message }` event. */
    private emitFailure(socketId: string, error: unknown): void {
        this.wsPort.emitToSocket(socketId, 'error', toErrorPayload(error, this.logger));
    }

    private withTimers(roomId: string, dto: GameStateDTO, gs: GameState): GameStateUpdatePayload {
        const room = this.roomPort.getRoom(roomId);
        return {
            ...dto,
            afkClaimInMs: computeAfkClaimInMs(gs, room?.phaseStartedAt, Date.now(), this.claimConfig.afkLimitMs),
        };
    }

    private resolveRound(roomId: string, gs: GameState): void {
        const { state: resolved, log } = invariant(performResolve(gs));
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
        // POISON and REGEN act at the start of the next round, before the roll; the poison can end the match.
        next = upkeep(endOfRound(next));
        const upkeepWinner = checkWinner(next);
        if (upkeepWinner !== null) {
            this.roomPort.updateGameState(roomId, next);
            // Send the board the poison left, so the clients see what decided the match before the result.
            this.wsPort.emitToRoom(roomId, 'gameStateUpdated', this.withTimers(roomId, GameStateMapper.toDTO(next), next));
            const payload: GameOverDTO = { winner: upkeepWinner, reason: 'elimination' };
            this.wsPort.emitToRoom(roomId, 'gameOver', payload);
            return;
        }
        next = invariant(performRoll(beginRollPhase(next)));
        this.roomPort.updateGameState(roomId, next);
        this.wsPort.emitToRoom(roomId, 'gameStateUpdated', this.withTimers(roomId, GameStateMapper.toDTO(next), next));
    }

    private doConfirm(
        socketId: string,
        ctx: GameContext,
        gs: GameState,
        domainFn: (gs: GameState, pi: PlayerIndex) => Result<GameState, DomainError>,
    ): void {
        const { room, playerIndex } = ctx;
        try {
            const otherIndex = (1 - playerIndex) as PlayerIndex;
            const wasOtherReady = gs.playersReady[otherIndex];
            const result = domainFn(gs, playerIndex);
            if (result.isErr()) { this.emitFailure(socketId, result.error); return; }
            const confirmed = result.value;
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
            this.emitFailure(socketId, e);
        }
    }

    /** Deck snapshot -> templates. A missing id can only mean a broken snapshot: refuse to start. */
    private templatesFor(deck: readonly CatalogId[]): CharacterTemplate[] {
        return deck.map(id => {
            const template = this.catalogPort.get(id);
            if (!template) throw new Error(`Unknown character in deck: ${id}`);
            return template;
        });
    }

    /**
     * Team preview and placement are secret: each player gets their own view (opponent's pick and
     * team hidden). A room-wide broadcast can't differ per viewer, so emit to each socket.
     */
    private emitPerViewer(roomId: string, players: readonly string[], gs: GameState): void {
        players.forEach((playerSessionId, idx) => {
            const playerSession = this.sessionPort.getSessionById(playerSessionId);
            if (!playerSession) return;
            this.emitToViewer(playerSession.socketId, roomId, gs, idx as PlayerIndex);
        });
    }

    private emitToViewer(socketId: string, roomId: string, gs: GameState, viewerIndex: PlayerIndex): void {
        const view = GameStateMapper.toDTOForViewer(gs, viewerIndex);
        this.wsPort.emitToSocket(socketId, 'gameStateUpdated', this.withTimers(roomId, view, gs));
    }

    startGame(socketId: string): void {
        const session = this.sessionPort.getSession(socketId);
        if (!session?.roomId) return;
        const room = this.roomPort.getRoom(session.roomId);
        if (!room) return;

        try {
            if (room.ownerId !== session.sessionId) {
                this.emitFailure(socketId, domainError('NOT_ROOM_OWNER', 'Only the room owner can start the game'));
                return;
            }
            if (!isRoomReady(room)) {
                this.emitFailure(socketId, domainError('ROOM_NOT_READY', 'Room is not ready to start'));
                return;
            }
            const decks = selectedDecks(room);
            if (decks.isErr()) { this.emitFailure(socketId, decks.error); return; }

            const [deck0, deck1] = decks.value;
            const gameState = createSelectionState([this.templatesFor(deck0), this.templatesFor(deck1)]);

            const started = this.roomPort.startGame(room.roomId, gameState);
            if (started.isErr()) { this.emitFailure(socketId, started.error); return; }
            this.emitPerViewer(room.roomId, room.playersId, gameState);
        } catch (e: unknown) {
            this.emitFailure(socketId, e);
        }
    }

    confirmSelection(socketId: string, characterIds: string[]): void {
        const context = this.getContext(socketId);
        if (context.isErr()) { this.emitFailure(socketId, context.error); return; }
        const ctx = context.value;
        const { room, playerIndex } = ctx;
        try {
            if (!Array.isArray(characterIds) || characterIds.some(id => typeof id !== 'string')) {
                this.emitFailure(socketId, domainError('INVALID_SELECTION', 'characterIds must be an array of catalog ids'));
                return;
            }
            const confirmed = domainConfirmSelection(room.gameState, playerIndex, characterIds as CatalogId[],
                template => createCharacterFromTemplate(template, this.effectFactory));
            if (confirmed.isErr()) { this.emitFailure(socketId, confirmed.error); return; }
            const gs = confirmed.value;
            this.roomPort.updateGameState(room.roomId, gs);
            if (gs.phase === GamePhase.PLACEMENT) {
                this.emitPerViewer(room.roomId, room.playerOrder ?? room.playersId, gs);
            } else {
                // First to pick: only the picker learns about it, the pick stays secret.
                this.emitToViewer(socketId, room.roomId, gs, playerIndex);
            }
        } catch (e: unknown) {
            this.emitFailure(socketId, e);
        }
    }

    cancelSelection(socketId: string): void {
        const context = this.getContext(socketId);
        if (context.isErr()) { this.emitFailure(socketId, context.error); return; }
        const ctx = context.value;
        const { room, playerIndex } = ctx;
        try {
            const cancelled = domainCancelSelection(room.gameState, playerIndex);
            if (cancelled.isErr()) { this.emitFailure(socketId, cancelled.error); return; }
            const gs = cancelled.value;
            if (gs !== room.gameState) {
                this.roomPort.updateGameState(room.roomId, gs);
                this.emitToViewer(socketId, room.roomId, gs, playerIndex);
            }
        } catch (e: unknown) {
            this.emitFailure(socketId, e);
        }
    }

    rearrangeTeam(socketId: string, slots: (string | null)[]): void {
        const context = this.getContext(socketId);
        if (context.isErr()) { this.emitFailure(socketId, context.error); return; }
        const ctx = context.value;
        const { room, playerIndex } = ctx;
        try {
            const placed = checkPhase(room.gameState, GamePhase.PLACEMENT)
                .andThen(gs => checkNotReady(gs, playerIndex))
                .andThen(gs => placeTeam(gs.players[playerIndex], slots));
            if (placed.isErr()) { this.emitFailure(socketId, placed.error); return; }
            const updatedPlayer = placed.value;
            const players = [...room.gameState.players] as [Player, Player];
            players[playerIndex] = updatedPlayer;
            const updatedGs = { ...room.gameState, players };
            this.roomPort.updateGameState(room.roomId, updatedGs);
            // Echo the persisted layout back to the actor only: the client is
            // prop-controlled and would otherwise snap the drag back. The
            // opponent is not notified, so the arrangement stays secret.
            this.wsPort.emitToSocket(socketId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTOForPlacement(updatedGs, playerIndex), updatedGs));
        } catch (e: unknown) {
            this.emitFailure(socketId, e);
        }
    }

    confirmPlacement(socketId: string): void {
        const context = this.getContext(socketId);
        if (context.isErr()) { this.emitFailure(socketId, context.error); return; }
        const ctx = context.value;
        const { room, playerIndex } = ctx;
        try {
            const otherIndex = (1 - playerIndex) as PlayerIndex;
            const wasOtherReady = room.gameState.playersReady[otherIndex];
            const confirmed = confirmPlacement(room.gameState, playerIndex);
            if (confirmed.isErr()) { this.emitFailure(socketId, confirmed.error); return; }
            let gs = confirmed.value;
            if (wasOtherReady) {
                gs = invariant(performRoll(gs));
                this.roomPort.updateGameState(room.roomId, gs);
                this.wsPort.emitToRoom(room.roomId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTO(gs), gs));
            } else {
                this.roomPort.updateGameState(room.roomId, gs);
                this.wsPort.emitToSocket(socketId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTOForPlacement(gs, playerIndex), gs));
            }
        } catch (e: unknown) {
            this.emitFailure(socketId, e);
        }
    }

    confirmKeep(socketId: string, lockedCharacterIds: string[]): void {
        const context = this.getContext(socketId);
        if (context.isErr()) { this.emitFailure(socketId, context.error); return; }
        const ctx = context.value;
        if (!Array.isArray(lockedCharacterIds)) { this.emitFailure(socketId, domainError('INVALID_LOCK', 'lockedCharacterIds must be an array')); return; }
        const { room, playerIndex } = ctx;
        const player = room.gameState.players[playerIndex];
        const teamIds = new Set(player.team.map(c => c.id));
        for (const id of lockedCharacterIds) {
            if (!teamIds.has(id)) { this.emitFailure(socketId, domainError('INVALID_LOCK', `Unknown character id: ${id}`)); return; }
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
        const context = this.getContext(socketId);
        if (context.isErr()) { this.emitFailure(socketId, context.error); return; }
        const ctx = context.value;
        const { room, playerIndex } = ctx;
        try {
            const cancelled = domainCancelPlacement(room.gameState, playerIndex);
            if (cancelled.isErr()) { this.emitFailure(socketId, cancelled.error); return; }
            const gs = cancelled.value;
            if (gs !== room.gameState) {
                this.roomPort.updateGameState(room.roomId, gs);
                this.wsPort.emitToSocket(socketId, 'gameStateUpdated', this.withTimers(room.roomId, GameStateMapper.toDTOForPlacement(gs, playerIndex), gs));
            }
        } catch (e: unknown) {
            this.emitFailure(socketId, e);
        }
    }

    cancelKeep(socketId: string): void {
        const context = this.getContext(socketId);
        if (context.isErr()) { this.emitFailure(socketId, context.error); return; }
        const ctx = context.value;
        const { room, playerIndex } = ctx;
        try {
            const cancelled = domainCancelKeep(room.gameState, playerIndex);
            if (cancelled.isErr()) { this.emitFailure(socketId, cancelled.error); return; }
            const gs = cancelled.value;
            if (gs !== room.gameState) this.roomPort.updateGameState(room.roomId, gs);
        } catch (e: unknown) {
            this.emitFailure(socketId, e);
        }
    }

    claimVictory(socketId: string): void {
        const context = this.getContext(socketId);
        if (context.isErr()) { this.emitFailure(socketId, context.error); return; }
        const ctx = context.value;
        const { room, playerIndex } = ctx;
        try {
            const opponentIndex = (1 - playerIndex) as PlayerIndex;
            const opponentPresence = room.presence?.[opponentIndex];
            if (!opponentPresence) { this.emitFailure(socketId, domainError('ACTION_NOT_AVAILABLE', 'Action not available')); return; }

            const verdict = evaluateClaim(
                room.gameState, playerIndex, opponentPresence, room.phaseStartedAt, Date.now(), this.claimConfig,
            );
            if (verdict.isErr()) { this.emitFailure(socketId, verdict.error); return; }

            this.roomPort.updateGameState(room.roomId, beginResultPhase(room.gameState));
            const payload: GameOverDTO = { winner: playerIndex, reason: verdict.value };
            this.wsPort.emitToRoom(room.roomId, 'gameOver', payload);
        } catch (e: unknown) {
            this.emitFailure(socketId, e);
        }
    }
}
