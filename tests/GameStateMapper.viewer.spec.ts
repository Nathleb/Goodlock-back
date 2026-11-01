import { asCharacter } from './helpers/ids';
import { TEST_CATALOG_ID, testTemplate } from './helpers/catalog';
import { GameStateMapper } from '@application/mappers/GameStateMapper';
import GameState, { SelectionState } from '@domain/types/GameState.type';
import { createSelectionState } from '@domain/services/GameLoop.service';
import { CatalogId } from '@shared/branded.types';
import GamePhase from '@domain/types/GamePhase.type';
import Character from '@domain/types/Character.type';
import { Player } from '@domain/types/Player.type';
import { SlotIndex, PlayerIndex } from '@domain/types/Position.type';
import DieFace from '@domain/types/DieFace.type';
import EffectLabel from '@domain/types/EffectLabels.type';
import { generateFullDie, createCharacter } from '@domain/services/CharacterGeneration.service';
import { BaseDieInstructions } from '@domain/types/BaseDieInstructions.type';
import { enemyRel } from './helpers/targets';

const FACE: DieFace = { description: 'd', priority: 1, effects: [] };

function char(id: string, playerIndex: PlayerIndex, slot: number, locked: boolean): Character {
    return {
        id: asCharacter(id), catalogId: TEST_CATALOG_ID, name: id, maxHp: 10, baseSpeed: 1, hp: 10, shield: 0, modifiers: [], states: {},
        baseDie: [FACE, FACE, FACE, FACE, FACE, FACE], face: FACE, isFaceLocked: locked,
        position: { playerIndex, slot: slot as SlotIndex },
    };
}

function gs(phase: GamePhase, playersReady: [boolean, boolean]): GameState {
    const team = (pi: PlayerIndex): Player => ({
        playerIndex: pi,
        team: [char(`c${pi}0`, pi, 0, true), char(`c${pi}1`, pi, 1, false)],
    });
    return { phase, currentRound: 1, initiativePlayerIndex: 0, rollsLeft: 1, playersReady, priorityQueue: [], players: [team(0), team(1)] };
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

    it('shows opponent locks again once KEEP is over, even with the opponent still flagged ready', () => {
        const dto = GameStateMapper.toDTOForViewer(gs(GamePhase.RESOLVE, [false, true]), 0);
        expect(dto.players[1].team[0].isFaceLocked).toBe(true);
    });

    it('keeps opponent locks during KEEP when the opponent has not confirmed', () => {
        const dto = GameStateMapper.toDTOForViewer(gs(GamePhase.KEEP, [false, false]), 0);
        expect(dto.players[1].team[0].isFaceLocked).toBe(true);
    });

    it('hides the opponent team entirely during PLACEMENT (picks stay secret until combat)', () => {
        const dto = GameStateMapper.toDTOForViewer(gs(GamePhase.PLACEMENT, [false, false]), 0);
        expect(dto.players[0].team.map(c => c.id)).toEqual(['c00', 'c01']);
        expect(dto.players[1].team).toEqual([]);
        expect(JSON.stringify(dto)).not.toContain('c10');
    });

    it('hides player 0 from viewer 1 during PLACEMENT', () => {
        const dto = GameStateMapper.toDTOForPlacement(gs(GamePhase.PLACEMENT, [false, false]), 1);
        expect(dto.players[0].team).toEqual([]);
        expect(dto.players[1].team).toHaveLength(2);
    });

    it('reveals both teams from ROLL on', () => {
        const dto = GameStateMapper.toDTOForViewer(gs(GamePhase.ROLL, [false, false]), 0);
        expect(dto.players[1].team).toHaveLength(2);
    });

    it('masks player 0 when the viewer is player 1', () => {
        const dto = GameStateMapper.toDTOForViewer(gs(GamePhase.KEEP, [true, false]), 1);
        expect(dto.players[0].team.every(c => c.isFaceLocked === false)).toBe(true);
    });
});

describe('initiative in the public DTO', () => {
    const phases = [GamePhase.SELECTION, GamePhase.PLACEMENT, GamePhase.ROLL, GamePhase.KEEP, GamePhase.RESOLVE, GamePhase.RESULT];

    it.each(phases)('is exposed to both viewers in %s', (phase) => {
        const state: GameState = { ...gs(phase, [false, false]), initiativePlayerIndex: 1 };
        expect(GameStateMapper.toDTOForViewer(state, 0).initiativePlayerIndex).toBe(1);
        expect(GameStateMapper.toDTOForViewer(state, 1).initiativePlayerIndex).toBe(1);
    });

    it('is carried by the room-wide DTO', () => {
        const state: GameState = { ...gs(GamePhase.ROLL, [false, false]), initiativePlayerIndex: 0 };
        expect(GameStateMapper.toDTO(state).initiativePlayerIndex).toBe(0);
    });
});

describe('team selection view', () => {
    const deck = (p: string) => Array.from({ length: 7 }, (_, i) => testTemplate(`${p}${i}`));
    const PICK_1 = ['b0', 'b1', 'b2', 'b3', 'b4'] as CatalogId[];
    const selecting = (picks: SelectionState['picks'], ready: [boolean, boolean]): GameState => ({
        ...createSelectionState([deck('a'), deck('b')]),
        playersReady: ready,
        selection: { decks: [deck('a'), deck('b')], picks },
    });

    it('reveals both full decks to the viewer', () => {
        const dto = GameStateMapper.toDTOForViewer(selecting([null, null], [false, false]), 0);
        expect(dto.selection?.decks[0].map(c => c.id)).toEqual(['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
        expect(dto.selection?.decks[1].map(c => c.id)).toEqual(['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6']);
        expect(dto.selection?.decks[1][0].baseDie).toHaveLength(6);
    });

    it("gives the viewer their own pick, never the opponent's", () => {
        const mine = ['a0', 'a1', 'a2', 'a3', 'a4'] as CatalogId[];
        const forViewer0 = GameStateMapper.toDTOForViewer(selecting([mine, PICK_1], [true, true]), 0);
        expect(forViewer0.selection?.myPicks).toEqual(mine);
        expect(Object.keys(forViewer0.selection ?? {}).sort()).toEqual(['decks', 'myPicks']);
        expect(JSON.stringify(forViewer0)).not.toContain('"picks"');

        const forViewer1 = GameStateMapper.toDTOForViewer(selecting([mine, null], [true, false]), 1);
        expect(forViewer1.selection?.myPicks).toBeNull();
    });

    it('the room-wide DTO never carries selection data', () => {
        expect(GameStateMapper.toDTO(selecting([null, PICK_1], [false, true])).selection).toBeUndefined();
    });
});

describe('resolveStepsToDTO', () => {
    it('maps the resolved cells of every effect, including fizzles', () => {
        const dto = GameStateMapper.resolveStepsToDTO([{
            characterId: asCharacter('x'),
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
        const die = generateFullDie(Array(6).fill({
            description: 'd', priority: 0, effects: [
                { effect: EffectLabel.Damage, magnitude: 3, targets: [enemyRel(-1, 0, 1)] },
            ],
        }) as unknown as BaseDieInstructions);
        const character = createCharacter({ catalogId: TEST_CATALOG_ID, name: 'T', maxHp: 10, baseSpeed: 1, baseDie: die, position: { playerIndex: 0, slot: 0 } });
        const dto = GameStateMapper.characterToDTO(character);
        expect(dto.catalogId).toBe(TEST_CATALOG_ID);
        expect(dto.face.effects).toEqual([
            { effect: 'Damage', magnitude: 3, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [-1, 0, 1] }] },
        ]);
    });
});

describe('stats in the DTO', () => {
    const power = (value: number, roundsLeft = 2) => ({ stat: 'POWER' as const, value, roundsLeft, appliedRound: 1 });

    it('lists the instances without the internal appliedRound', () => {
        const dto = GameStateMapper.characterToDTO({ ...char('a', 0, 0, false), modifiers: [power(3, 2), power(-1, 1)] });
        expect(dto.modifiers).toEqual([{ stat: 'POWER', value: 3, roundsLeft: 2 }, { stat: 'POWER', value: -1, roundsLeft: 1 }]);
    });

    it('gives the capped net value per stat, 0 when there is no instance', () => {
        expect(GameStateMapper.characterToDTO(char('a', 0, 0, false)).stats).toEqual({ POWER: 0, ARMOR: 0 });
        const heavy = GameStateMapper.characterToDTO({ ...char('a', 0, 0, false), modifiers: [power(6), power(6)] });
        expect(heavy.stats).toEqual({ POWER: 9, ARMOR: 0 });
    });

    it('gives a net value per stat, ARMOR included, each capped on its own', () => {
        const armor = (value: number) => ({ stat: 'ARMOR' as const, value, roundsLeft: 2, appliedRound: 1 });
        const dto = GameStateMapper.characterToDTO({ ...char('a', 0, 0, false), modifiers: [power(2), armor(6), armor(6)] });

        expect(dto.stats).toEqual({ POWER: 2, ARMOR: 9 });
        expect(dto.modifiers.filter(m => m.stat === 'ARMOR')).toEqual([
            { stat: 'ARMOR', value: 6, roundsLeft: 2 }, { stat: 'ARMOR', value: 6, roundsLeft: 2 },
        ]);
    });

    it('carries stat and duration on an ApplyStat face effect, and nothing extra on others', () => {
        const apply = { label: EffectLabel.ApplyStat, magnitude: 3, stat: 'POWER' as const, duration: 2, targets: [] };
        const damage = { label: EffectLabel.Damage, magnitude: 5, targets: [] };
        const face: DieFace = { description: 'd', priority: 0, effects: [apply, damage] };

        const dto = GameStateMapper.characterToDTO({ ...char('a', 0, 0, false), face });

        expect(dto.face.effects[0]).toMatchObject({ effect: 'ApplyStat', magnitude: 3, stat: 'POWER', duration: 2 });
        expect('stat' in dto.face.effects[1]).toBe(false);
        expect('duration' in dto.face.effects[1]).toBe(false);
    });

    it('shows up in the resolve-step changes too', () => {
        const dto = GameStateMapper.resolveStepsToDTO([{
            characterId: asCharacter('a'), skipped: false, effects: [],
            changes: [{ characterId: asCharacter('a'), character: { ...char('a', 0, 0, false), modifiers: [power(3)] } }],
        }]);
        expect(dto[0].changes[0].after.stats).toEqual({ POWER: 3, ARMOR: 0 });
    });
});

describe('states in the DTO', () => {
    it('lists every axis with its signed counter, 0 when none', () => {
        const dto = GameStateMapper.characterToDTO(char('a', 0, 0, false));
        expect(dto.states).toEqual({ SPEED: 0, VITALITY: 0, STUN: 0, ROOT: 0, DIVINE_SHIELD: 0 });
    });

    it('carries the signed value without the internal touchedRound', () => {
        const dto = GameStateMapper.characterToDTO({
            ...char('a', 0, 0, false),
            states: { SPEED: { value: -2, touchedRound: 3 }, STUN: { value: 1, touchedRound: 3 } },
        });
        expect(dto.states).toEqual({ SPEED: -2, VITALITY: 0, STUN: 1, ROOT: 0, DIVINE_SHIELD: 0 });
    });

    it('carries state and duration on an ApplyState face effect, and nothing extra on others', () => {
        const apply = { label: EffectLabel.ApplyState, magnitude: 0, state: 'STUN' as const, duration: 1, targets: [] };
        const damage = { label: EffectLabel.Damage, magnitude: 5, targets: [] };
        const face: DieFace = { description: 'd', priority: 0, effects: [apply, damage] };

        const dto = GameStateMapper.characterToDTO({ ...char('a', 0, 0, false), face });

        expect(dto.face.effects[0]).toMatchObject({ effect: 'ApplyState', magnitude: 0, state: 'STUN', duration: 1 });
        expect('state' in dto.face.effects[1]).toBe(false);
    });

    it('shows up in the resolve-step changes too', () => {
        const dto = GameStateMapper.resolveStepsToDTO([{
            characterId: asCharacter('a'), skipped: false, effects: [],
            changes: [{ characterId: asCharacter('a'), character: { ...char('a', 0, 0, false), states: { ROOT: { value: 2, touchedRound: 1 } } } }],
        }]);
        expect(dto[0].changes[0].after.states.ROOT).toBe(2);
    });
});
