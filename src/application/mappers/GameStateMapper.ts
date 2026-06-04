import GameState from '@domain/types/GameState.type';
import Character from '@domain/types/Character.type';
import DieFace from '@domain/types/DieFace.type';
import { Player } from '@domain/types/Player.type';
import { ResolveStep } from '@domain/types/PriorityQueue.type';
import { PlayerIndex } from '@domain/types/Position.type';
import { GameStateDTO, PlayerGameStateDTO, CharacterDTO, DieFaceDTO, ResolveStepDTO } from '@application/dtos/GameState.dto';

export class GameStateMapper {
    static toDTO(gameState: GameState): GameStateDTO {
        return {
            phase: gameState.phase,
            currentRound: gameState.currentRound,
            rollsLeft: gameState.rollsLeft,
            playersReady: [...gameState.playersReady] as [boolean, boolean],
            players: gameState.players.map(GameStateMapper.playerToDTO) as [PlayerGameStateDTO, PlayerGameStateDTO],
        };
    }

    static toDTOForPlacement(gameState: GameState, viewerIndex: PlayerIndex): GameStateDTO {
        const dto = GameStateMapper.toDTO(gameState);
        const enemyIndex = (1 - viewerIndex) as 0 | 1;
        const enemyPlayer = dto.players[enemyIndex];
        const sortedTeam = [...enemyPlayer.team]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((char, i) => ({ ...char, position: { ...char.position, slot: i } }));
        const players = [...dto.players] as [PlayerGameStateDTO, PlayerGameStateDTO];
        players[enemyIndex] = { ...enemyPlayer, team: sortedTeam };
        return { ...dto, players };
    }

    static resolveStepsToDTO(steps: ResolveStep[]): ResolveStepDTO[] {
        return steps.map(step => ({
            characterId: step.characterId,
            skipped: step.skipped,
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
            name: char.name,
            hp: char.hp,
            maxHp: char.maxHp,
            shield: char.shield,
            baseSpeed: char.baseSpeed,
            baseDie: char.baseDie.map(GameStateMapper.faceToDTO),
            face: GameStateMapper.faceToDTO(char.face),
            isFaceLocked: char.isFaceLocked,
            target: char.target,
            position: char.position,
        };
    }

    private static faceToDTO(face: DieFace): DieFaceDTO {
        return {
            description: face.description,
            priority: face.priority,
            targetConstraint: face.targetConstraint,
        };
    }
}
