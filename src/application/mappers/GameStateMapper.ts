import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import Character from '@domain/types/Character.type';
import DieFace from '@domain/types/DieFace.type';
import { Player } from '@domain/types/Player.type';
import { ResolveStep } from '@domain/types/PriorityQueue.type';
import { PlayerIndex } from '@domain/types/Position.type';
import { GameStateDTO, PlayerGameStateDTO, CharacterDTO, DieFaceDTO, ResolveStepDTO } from '@application/dtos/GameState.dto';
import { netStat, stateValue } from '@domain/services/Character.service';
import { STAT_NAMES } from '@domain/types/Modifier.type';
import { STATE_AXES } from '@domain/types/State.type';
import { CatalogMapper } from './CatalogMapper';

export class GameStateMapper {
    static toDTO(gameState: GameState): GameStateDTO {
        return {
            phase: gameState.phase,
            currentRound: gameState.currentRound,
            initiativePlayerIndex: gameState.initiativePlayerIndex,
            rollsLeft: gameState.rollsLeft,
            playersReady: [...gameState.playersReady] as [boolean, boolean],
            players: gameState.players.map(GameStateMapper.playerToDTO) as [PlayerGameStateDTO, PlayerGameStateDTO],
        };
    }

    /** PLACEMENT: the opponent's picks stay secret until combat, so their team is sent empty. */
    static toDTOForPlacement(gameState: GameState, viewerIndex: PlayerIndex): GameStateDTO {
        return GameStateMapper.hideOpponentTeam(GameStateMapper.toDTO(gameState), viewerIndex);
    }

    /** SELECTION: both decks are revealed; only the viewer's own pick is included. */
    static toDTOForSelection(gameState: GameState, viewerIndex: PlayerIndex): GameStateDTO {
        const dto = GameStateMapper.hideOpponentTeam(GameStateMapper.toDTO(gameState), viewerIndex);
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
        players[enemyIndex] = { ...players[enemyIndex], team: [] };
        return { ...dto, players };
    }

    static toDTOForViewer(gameState: GameState, viewerIndex: PlayerIndex): GameStateDTO {
        if (gameState.phase === GamePhase.SELECTION) {
            return GameStateMapper.toDTOForSelection(gameState, viewerIndex);
        }
        if (gameState.phase === GamePhase.PLACEMENT) {
            return GameStateMapper.toDTOForPlacement(gameState, viewerIndex);
        }
        const dto = GameStateMapper.toDTO(gameState);
        const enemyIndex = (1 - viewerIndex) as 0 | 1;
        const maskLocks = gameState.phase === GamePhase.KEEP && gameState.playersReady[enemyIndex];
        const enemyTeam = dto.players[enemyIndex].team.map(char => ({
            ...char,
            isFaceLocked: maskLocks ? false : char.isFaceLocked,
        }));
        const players = [...dto.players] as [PlayerGameStateDTO, PlayerGameStateDTO];
        players[enemyIndex] = { ...players[enemyIndex], team: enemyTeam };
        return { ...dto, players };
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
            isFaceLocked: char.isFaceLocked,
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
