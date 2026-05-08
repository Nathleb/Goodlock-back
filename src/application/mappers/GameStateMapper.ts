import GameState from '@domain/types/GameState.type';
import Character from '@domain/types/Character.type';
import DieFace from '@domain/types/DieFace.type';
import { Player } from '@domain/types/Player.type';
import { ResolveStep } from '@domain/types/PriorityQueue.type';
import { GameStateDTO, PlayerGameStateDTO, CharacterDTO, DieFaceDTO, ResolveStepDTO } from '@application/dtos/GameState.dto';

export class GameStateMapper {
    static toDTO(gameState: GameState): GameStateDTO {
        return {
            phase: gameState.phase,
            currentRound: gameState.currentRound,
            rollsLeft: gameState.rollsLeft,
            playersReady: gameState.playersReady,
            players: gameState.players.map(GameStateMapper.playerToDTO) as [PlayerGameStateDTO, PlayerGameStateDTO],
        };
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
        };
    }
}
