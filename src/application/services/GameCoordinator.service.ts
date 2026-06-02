import * as fs from 'fs';
import * as path from 'path';
import { Injectable, Inject } from '@nestjs/common';
import { SESSION_PORT, ROOM_PORT, WEBSOCKET_PORT, EFFECT_FACTORY } from '@application/ports/tokens';
import { SessionPort } from '@application/ports/SessionPort';
import { RoomPort } from '@application/ports/RoomPort';
import { WebSocketPort } from '@application/ports/WebSocketPort';
import { Session } from '@application/dtos/Session.dto';
import { GameStateMapper } from '@application/mappers/GameStateMapper';
import { Room } from '@domain/types/Room.type';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import Position, { PlayerIndex, SlotIndex } from '@domain/types/Position.type';
import { Player } from '@domain/types/Player.type';
import { assertPhase, assertNotReady, beginRollPhase } from '@domain/services/Phase.service';
import EffectFactory from '@domain/factories/EffectFactory.class';
import { createCharacterFromJsonTemplate } from '@domain/services/CharacterGeneration.service';
import { createGameState } from '@domain/services/GameInit.service';
import { createPlayer, rearrangeTeam, selectTargetOfCharacter } from '@domain/services/Player.service';
import { isRoomReady } from '@domain/services/Room.service';
import { checkWinner, endOfRound } from '@domain/services/Round.service';
import {
    confirmPlacement, performRoll,
    confirmKeep,
    confirmAssignment as domainConfirmAssignment,
    cancelPlacement as domainCancelPlacement,
    cancelKeep as domainCancelKeep,
    cancelAssignment as domainCancelAssignment,
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
    ) {}

    private getContext(socketId: string): GameContext | null {
        const session = this.sessionPort.getSession(socketId);
        if (!session?.roomId) return null;
        const room = this.roomPort.getRoom(session.roomId);
        if (!room?.gameState) return null;
        const idx = room.playersId.indexOf(session.sessionId);
        if (idx === -1) return null;
        return { session, room, playerIndex: idx as PlayerIndex };
    }

    private emitError(socketId: string, message: string): void {
        this.wsPort.emitToSocket(socketId, 'error', { message });
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
            this.roomPort.updateGameState(room.roomId, confirmed);
            if (wasOtherReady) {
                this.wsPort.emitToRoom(room.roomId, 'gameStateUpdated', GameStateMapper.toDTO(confirmed));
            }
        } catch (e: unknown) {
            this.emitError(socketId, (e as Error).message);
        }
    }

    private loadTemplates(): string[] {
        const dir = path.join(process.cwd(), 'tmplt');
        return fs.readdirSync(dir)
            .filter(f => f.endsWith('.json'))
            .map(f => fs.readFileSync(path.join(dir, f), 'utf-8'));
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

            const templates = this.shuffle(this.loadTemplates());
            if (templates.length < 10) throw new Error('Not enough character templates');

            const player0 = createPlayer(templates.slice(0, 5).map(t => createCharacterFromJsonTemplate(t, this.effectFactory)), 0);
            const player1 = createPlayer(templates.slice(5, 10).map(t => createCharacterFromJsonTemplate(t, this.effectFactory)), 1);
            const gameState = createGameState(player0, player1);

            this.roomPort.startGame(room.roomId, gameState);
            this.wsPort.emitToRoom(room.roomId, 'gameStateUpdated', GameStateMapper.toDTO(gameState));
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
                this.wsPort.emitToRoom(room.roomId, 'gameStateUpdated', GameStateMapper.toDTO(gs));
            } else {
                this.roomPort.updateGameState(room.roomId, gs);
                this.wsPort.emitToSocket(socketId, 'gameStateUpdated', GameStateMapper.toDTOForPlacement(gs, playerIndex));
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

    confirmAssignment(socketId: string, targets: { characterId: string; target: { playerIndex: number; slot: number } }[]): void {
        const ctx = this.getContext(socketId);
        if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
        const { room, playerIndex } = ctx;
        const player = room.gameState.players[playerIndex];
        const teamIds = new Set(player.team.map(c => c.id));

        // Validate: 5 unique IDs covering exactly the player's team, valid target positions
        const payloadIds = new Set(targets.map(t => t.characterId));
        if (targets.length !== 5 || payloadIds.size !== 5) {
            this.emitError(socketId, 'Payload must contain exactly one entry per character');
            return;
        }
        for (const entry of targets) {
            if (!teamIds.has(entry.characterId)) { this.emitError(socketId, `Unknown character id: ${entry.characterId}`); return; }
            if (entry.target.playerIndex !== 0 && entry.target.playerIndex !== 1) { this.emitError(socketId, 'Invalid target playerIndex'); return; }
            if (entry.target.slot < 0 || entry.target.slot > 4) { this.emitError(socketId, 'Invalid target slot'); return; }
        }

        try {
            // Apply targets
            let updatedPlayer = player;
            for (const entry of targets) {
                const target: Position = {
                    playerIndex: entry.target.playerIndex as PlayerIndex,
                    slot: entry.target.slot as SlotIndex,
                };
                const charSlot = updatedPlayer.team.find(c => c.id === entry.characterId)!.position.slot;
                updatedPlayer = selectTargetOfCharacter(updatedPlayer, charSlot, target);
            }
            const players = [...room.gameState.players] as [Player, Player];
            players[playerIndex] = updatedPlayer;
            const gsWithTargets: GameState = { ...room.gameState, players };

            // Confirm and resolve
            const otherIndex = (1 - playerIndex) as PlayerIndex;
            const wasOtherReady = gsWithTargets.playersReady[otherIndex];
            let gs = domainConfirmAssignment(gsWithTargets, playerIndex);

            if (!wasOtherReady) {
                this.roomPort.updateGameState(room.roomId, gs);
                return;
            }

            const { state: resolved, log } = performResolve(gs);
            gs = resolved;
            const winner = checkWinner(gs);

            this.roomPort.updateGameState(room.roomId, gs);
            this.wsPort.emitToRoom(room.roomId, 'roundResolved', {
                gameState: GameStateMapper.toDTO(gs),
                resolveLog: GameStateMapper.resolveStepsToDTO(log),
            });

            if (winner !== null) {
                this.wsPort.emitToRoom(room.roomId, 'gameOver', { winner });
            } else {
                gs = performRoll(beginRollPhase(endOfRound(gs)));
                this.roomPort.updateGameState(room.roomId, gs);
                this.wsPort.emitToRoom(room.roomId, 'gameStateUpdated', GameStateMapper.toDTO(gs));
            }
        } catch (e: unknown) {
            this.emitError(socketId, (e as Error).message);
        }
    }

    cancelPlacement(socketId: string): void {
        const ctx = this.getContext(socketId);
        if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
        const { room, playerIndex } = ctx;
        try {
            const gs = domainCancelPlacement(room.gameState, playerIndex);
            if (gs !== room.gameState) {
                this.roomPort.updateGameState(room.roomId, gs);
                this.wsPort.emitToSocket(socketId, 'gameStateUpdated', GameStateMapper.toDTOForPlacement(gs, playerIndex));
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

    cancelAssignment(socketId: string): void {
        const ctx = this.getContext(socketId);
        if (!ctx) { this.emitError(socketId, 'Action not available'); return; }
        const { room, playerIndex } = ctx;
        try {
            const gs = domainCancelAssignment(room.gameState, playerIndex);
            if (gs !== room.gameState) this.roomPort.updateGameState(room.roomId, gs);
        } catch (e: unknown) {
            this.emitError(socketId, (e as Error).message);
        }
    }
}
