import { TEST_CATALOG_ID } from './helpers/catalog';
import { GameStateMapper } from '@application/mappers/GameStateMapper';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import Character from '@domain/types/Character.type';
import { Player } from '@domain/types/Player.type';
import { SlotIndex, PlayerIndex } from '@domain/types/Position.type';
import DieFace from '@domain/types/DieFace.type';
import EffectLabel from '@domain/types/EffectLabels.type';
import { buildEffectFactory } from '@domain/services/GameInit.service';
import { generateFullDie, createCharacter } from '@domain/services/CharacterGeneration.service';
import { BaseDieInstructions } from '@domain/types/BaseDieInstructions.type';
import { enemyRel } from './helpers/targets';

const FACE: DieFace = { description: 'd', priority: 1, effects: [] };

function char(id: string, playerIndex: PlayerIndex, slot: number, locked: boolean): Character {
    return {
        id, catalogId: TEST_CATALOG_ID, name: id, maxHp: 10, baseSpeed: 1, hp: 10, shield: 0, modifiers: [],
        baseDie: [FACE, FACE, FACE, FACE, FACE, FACE], face: FACE, isFaceLocked: locked,
        position: { playerIndex, slot: slot as SlotIndex },
    };
}

function gs(phase: GamePhase, playersReady: [boolean, boolean]): GameState {
    const team = (pi: PlayerIndex): Player => ({
        playerIndex: pi,
        team: [char(`c${pi}0`, pi, 0, true), char(`c${pi}1`, pi, 1, false)],
    });
    return { phase, currentRound: 1, rollsLeft: 1, playersReady, priorityQueue: [], players: [team(0), team(1)] };
}

describe('toDTOForViewer', () => {
    it('exposes no target field on characters', () => {
        const dto = GameStateMapper.toDTOForViewer(gs(GamePhase.RESOLVE, [false, true]), 0);
        expect(dto.players.every(p => p.team.every(c => !('target' in c)))).toBe(true);
    });

    it('masks opponent locks during KEEP when the opponent already confirmed', () => {
        const dto = GameStateMapper.toDTOForViewer(gs(GamePhase.KEEP, [false, true]), 0);
        expect(dto.players[1].team.every(c => c.isFaceLocked === false)).toBe(true);
    });

    it('keeps opponent locks during KEEP when the opponent has not confirmed', () => {
        const dto = GameStateMapper.toDTOForViewer(gs(GamePhase.KEEP, [false, false]), 0);
        expect(dto.players[1].team[0].isFaceLocked).toBe(true);
    });

    it('delegates to placement masking during PLACEMENT', () => {
        const viewer = GameStateMapper.toDTOForViewer(gs(GamePhase.PLACEMENT, [false, false]), 0);
        const placement = GameStateMapper.toDTOForPlacement(gs(GamePhase.PLACEMENT, [false, false]), 0);
        expect(viewer.players[1].team.map(c => c.position.slot))
            .toEqual(placement.players[1].team.map(c => c.position.slot));
    });

    it('masks player 0 when the viewer is player 1', () => {
        const dto = GameStateMapper.toDTOForViewer(gs(GamePhase.KEEP, [true, false]), 1);
        expect(dto.players[0].team.every(c => c.isFaceLocked === false)).toBe(true);
    });
});

describe('resolveStepsToDTO', () => {
    it('maps the resolved cells of every effect, including fizzles', () => {
        const dto = GameStateMapper.resolveStepsToDTO([{
            characterId: 'x',
            skipped: false,
            effects: [
                { effect: EffectLabel.Damage, targets: [{ playerIndex: 1, slot: 2 }] },
                { effect: EffectLabel.Heal, targets: [] },
            ],
            changes: [],
        }]);
        expect(dto[0].effects).toEqual([
            { effect: 'Damage', targets: [{ playerIndex: 1, slot: 2 }] },
            { effect: 'Heal', targets: [] },
        ]);
    });
});

describe('face DTO', () => {
    it('exposes each effect with its label, magnitude and target groups', () => {
        const factory = buildEffectFactory();
        const die = generateFullDie(Array(6).fill({
            description: 'd', priority: 0, effects: [
                { effect: EffectLabel.Damage, magnitude: 3, targets: [enemyRel(-1, 0, 1)] },
            ],
        }) as unknown as BaseDieInstructions, factory);
        const character = createCharacter({ catalogId: TEST_CATALOG_ID, name: 'T', maxHp: 10, baseSpeed: 1, baseDie: die, position: { playerIndex: 0, slot: 0 } });
        const dto = GameStateMapper.characterToDTO(character);
        expect(dto.face.effects).toEqual([
            { effect: 'Damage', magnitude: 3, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [-1, 0, 1] }] },
        ]);
    });
});
