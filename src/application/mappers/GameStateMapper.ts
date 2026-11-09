import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import Character from '@domain/types/Character.type';
import DieFace from '@domain/types/DieFace.type';
import { Player } from '@domain/types/Player.type';
import { ResolveStep } from '@domain/types/PriorityQueue.type';
import { PlayerIndex } from '@domain/types/Position.type';
import { isClockRunning } from '@domain/services/Clock.service';
import { GameStateDTO, PlayerClockDTO, PlayerGameStateDTO, CharacterDTO, ResolveStepDTO } from '@application/dtos/GameState.dto';
import { DieFaceDTO } from '@application/dtos/DieFace.dto';
import { netStat, stateValue } from '@domain/services/Character.service';
import { STAT_NAMES } from '@domain/types/Modifier.type';
import { STATE_AXES } from '@domain/types/State.type';
import { CatalogMapper } from './CatalogMapper';

export class GameStateMapper {
    /** What both players may see: never who has confirmed (GAME-9). */
    static toDTO(gameState: GameState): GameStateDTO {
        return {
            phase: gameState.phase,
            currentRound: gameState.currentRound,
            initiativePlayerIndex: gameState.initiativePlayerIndex,
            rollsLeft: gameState.rollsLeft,
            clocks: GameStateMapper.clocksToDTO(gameState),
            players: gameState.players.map(GameStateMapper.playerToDTO) as [PlayerGameStateDTO, PlayerGameStateDTO],
        };
    }

    /** PLACEMENT: the opponent's picks stay secret until combat, so their team is sent empty. */
    static toDTOForPlacement(gameState: GameState, viewerIndex: PlayerIndex): GameStateDTO {
        return GameStateMapper.withOwnConfirmation(
            GameStateMapper.hideOpponentTeam(GameStateMapper.toDTO(gameState), viewerIndex), gameState, viewerIndex);
    }

    /** SELECTION: both decks are revealed; only the viewer's own pick is included. */
    static toDTOForSelection(gameState: GameState, viewerIndex: PlayerIndex): GameStateDTO {
        const dto = GameStateMapper.toDTOForPlacement(gameState, viewerIndex);
        const selection = gameState.selection;
        if (!selection) return dto;
        const myPicks = selection.picks[viewerIndex];
        return {
            ...dto,
            selection: {
                decks: [selection.decks[0].map(CatalogMapper.toDTO), selection.decks[1].map(CatalogMapper.toDTO)],
                myPicks: myPicks ? [...myPicks] : null,
            },
        };
    }

    private static hideOpponentTeam(dto: GameStateDTO, viewerIndex: PlayerIndex): GameStateDTO {
        const enemyIndex = (1 - viewerIndex) as 0 | 1;
        const players = [...dto.players] as [PlayerGameStateDTO, PlayerGameStateDTO];
        players[enemyIndex] = { ...players[enemyIndex], team: [], fallen: [] };
        return { ...dto, players };
    }

    /**
     * Both clocks, read as if nobody had confirmed: a paused clock would tell that the opponent has
     * confirmed (GAME-9). The viewer's own clock is corrected in `withOwnConfirmation`.
     */
    private static clocksToDTO(gameState: GameState): [PlayerClockDTO, PlayerClockDTO] {
        const unconfirmed: GameState = { ...gameState, playersReady: [false, false] };
        return gameState.clocks.map((clock, i) => ({ ...clock, running: isClockRunning(unconfirmed, i as PlayerIndex) })) as [PlayerClockDTO, PlayerClockDTO];
    }

    /** The viewer learns whether they themselves have confirmed, never whether the opponent has (GAME-9). */
    private static withOwnConfirmation(dto: GameStateDTO, gameState: GameState, viewerIndex: PlayerIndex): GameStateDTO {
        const clocks = [...dto.clocks] as [PlayerClockDTO, PlayerClockDTO];
        clocks[viewerIndex] = { ...clocks[viewerIndex], running: isClockRunning(gameState, viewerIndex) };
        return { ...dto, clocks, myReady: gameState.playersReady[viewerIndex] };
    }

    static toDTOForViewer(gameState: GameState, viewerIndex: PlayerIndex): GameStateDTO {
        if (gameState.phase === GamePhase.SELECTION) {
            return GameStateMapper.toDTOForSelection(gameState, viewerIndex);
        }
        if (gameState.phase === GamePhase.PLACEMENT) {
            return GameStateMapper.toDTOForPlacement(gameState, viewerIndex);
        }
        // The viewer's own dice as they last confirmed them (KEEP-1); the opponent's stay as kept at the last Roll.
        const dto = GameStateMapper.toDTO(gameState);
        const own = gameState.players[viewerIndex];
        const players = [...dto.players] as [PlayerGameStateDTO, PlayerGameStateDTO];
        players[viewerIndex] = {
            ...players[viewerIndex],
            team: own.team.map(char => ({ ...GameStateMapper.characterToDTO(char), isFaceLocked: char.isFaceLocked })),
        };
        return GameStateMapper.withOwnConfirmation({ ...dto, players }, gameState, viewerIndex);
    }

    static resolveStepsToDTO(steps: ResolveStep[]): ResolveStepDTO[] {
        return steps.map(step => ({
            characterId: step.characterId,
            skipped: step.skipped,
            effects: step.effects.map(e => ({
                effect: e.effect,
                targets: e.targets.map(t => ({ playerIndex: t.playerIndex, slot: t.slot })),
            })),
            changes: step.changes.map(c => ({
                characterId: c.characterId,
                after: GameStateMapper.characterToDTO(c.character),
            })),
        }));
    }

    private static playerToDTO(player: Player): PlayerGameStateDTO {
        return {
            playerIndex: player.playerIndex,
            team: player.team.map(GameStateMapper.characterToDTO),
            fallen: (player.fallen ?? []).map(GameStateMapper.characterToDTO),
        };
    }

    static characterToDTO(char: Character): CharacterDTO {
        return {
            id: char.id,
            catalogId: char.catalogId,
            name: char.name,
            hp: char.hp,
            maxHp: char.maxHp,
            shield: char.shield,
            baseSpeed: char.baseSpeed,
            baseDie: char.baseDie.map(GameStateMapper.faceToDTO),
            face: GameStateMapper.faceToDTO(char.face),
            // Public: kept at the last Roll (ROLL-2). A choice in the current Keep stays with its owner (GAME-9).
            isFaceLocked: char.keptAtLastRoll,
            position: char.position,
            modifiers: char.modifiers.map(m => ({ stat: m.stat, value: m.value, roundsLeft: m.roundsLeft })),
            stats: Object.fromEntries(STAT_NAMES.map(stat => [stat, netStat(char, stat)])),
            states: Object.fromEntries(STATE_AXES.map(axis => [axis, stateValue(char, axis)])),
        };
    }

    private static faceToDTO(face: DieFace): DieFaceDTO {
        return {
            description: face.description,
            priority: face.priority,
            effects: face.effects.map(e => ({
                effect: e.label,
                magnitude: e.magnitude,
                ...(e.stat !== undefined && { stat: e.stat }),
                ...(e.state !== undefined && { state: e.state }),
                ...(e.duration !== undefined && { duration: e.duration }),
                targets: e.targets.map(g => ({ side: g.side, mode: g.mode, n: [...g.n] })),
            })),
        };
    }
}
