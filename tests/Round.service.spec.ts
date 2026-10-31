import { TEST_CATALOG_ID } from './helpers/catalog';
import EffectLabel from "@domain/types/EffectLabels.type";
import { enemyRel, allyRel } from "./helpers/targets";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { gainShield, loseHp } from "@domain/services/Character.service";
import { createGameState } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import { endOfRound, checkWinner } from "@domain/services/Round.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";

const baseDieInstructions: BaseDieInstructions = [
    { description: "Damage", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyRel(0)] }] },
    { description: "Heal", priority: 1, effects: [{ effect: EffectLabel.Heal, magnitude: 5, targets: [allyRel(0)] }] },
    { description: "Shield", priority: 1, effects: [{ effect: EffectLabel.Shield, magnitude: 5, targets: [allyRel(0)] }] },
    { description: "Damage", priority: 2, effects: [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyRel(0)] }] },
    { description: "Heal", priority: 2, effects: [{ effect: EffectLabel.Heal, magnitude: 5, targets: [allyRel(0)] }] },
    { description: "Shield", priority: 2, effects: [{ effect: EffectLabel.Shield, magnitude: 5, targets: [allyRel(0)] }] },
];

const die = generateFullDie(baseDieInstructions);

describe('Round.service', () => {
    it.each([[0, 1], [1, 0]] as const)('flips the initiative from %i to %i at end of round', (before, after) => {
        const makeChar = () => createCharacter({ catalogId: TEST_CATALOG_ID, name: "C", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });
        const gameState = createGameState(createPlayer([makeChar()], 0), createPlayer([makeChar()], 1), before);

        expect(endOfRound(gameState).initiativePlayerIndex).toBe(after);
    });

    it('should reset all shields to 0 at end of round', () => {
        const makeChar = () => createCharacter({ catalogId: TEST_CATALOG_ID, name: "C", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });
        const charWithShield = gainShield(makeChar(), 20);
        const player1 = createPlayer([charWithShield, makeChar(), makeChar(), makeChar(), makeChar()], 0);
        const player2 = createPlayer([gainShield(makeChar(), 10), makeChar(), makeChar(), makeChar(), makeChar()], 1);
        const gameState = createGameState(player1, player2);

        const updated = endOfRound(gameState);

        updated.players.forEach(player =>
            player.team.forEach(char => expect(char.shield).toBe(0))
        );
    });

    it('should not affect HP', () => {
        const makeChar = () => createCharacter({ catalogId: TEST_CATALOG_ID, name: "C", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });
        const player1 = createPlayer([makeChar(), makeChar(), makeChar(), makeChar(), makeChar()], 0);
        const player2 = createPlayer([makeChar(), makeChar(), makeChar(), makeChar(), makeChar()], 1);
        const gameState = createGameState(player1, player2);

        const updated = endOfRound(gameState);

        updated.players.forEach(player =>
            player.team.forEach(char => expect(char.hp).toBe(100))
        );
    });

    it('should increment currentRound', () => {
        const makeChar = () => createCharacter({ catalogId: TEST_CATALOG_ID, name: "C", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });
        const player1 = createPlayer([makeChar(), makeChar(), makeChar(), makeChar(), makeChar()], 0);
        const player2 = createPlayer([makeChar(), makeChar(), makeChar(), makeChar(), makeChar()], 1);
        const gameState = createGameState(player1, player2);

        const updated = endOfRound(gameState);

        expect(updated.currentRound).toBe(gameState.currentRound + 1);
    });

    it('should reset rollsLeft to 2', () => {
        const makeChar = () => createCharacter({ catalogId: TEST_CATALOG_ID, name: "C", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });
        const player1 = createPlayer([makeChar(), makeChar(), makeChar(), makeChar(), makeChar()], 0);
        const player2 = createPlayer([makeChar(), makeChar(), makeChar(), makeChar(), makeChar()], 1);
        const gameState = { ...createGameState(player1, player2), rollsLeft: 0 };

        const updated = endOfRound(gameState);

        expect(updated.rollsLeft).toBe(2);
    });

    it('should unlock all dice', () => {
        const makeChar = () => createCharacter({ catalogId: TEST_CATALOG_ID, name: "C", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });
        let player1 = createPlayer([makeChar(), makeChar(), makeChar(), makeChar(), makeChar()], 0);
        let player2 = createPlayer([makeChar(), makeChar(), makeChar(), makeChar(), makeChar()], 1);
        player1 = { ...player1, team: player1.team.map((c, i) => i === 0 ? { ...c, isFaceLocked: true } : c) };
        player2 = { ...player2, team: player2.team.map((c, i) => i === 2 ? { ...c, isFaceLocked: true } : c) };
        const gameState = createGameState(player1, player2);

        const updated = endOfRound(gameState);

        updated.players.forEach(player =>
            player.team.forEach(char => expect(char.isFaceLocked).toBe(false))
        );
    });
});

describe('checkWinner', () => {
    const makeChar = () => createCharacter({ catalogId: TEST_CATALOG_ID, name: "C", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });
    const dead = () => loseHp(makeChar(), 100);
    const alive4 = () => [makeChar(), makeChar(), makeChar(), makeChar()];
    const dead2 = () => [dead(), dead(), makeChar(), makeChar()];

    it('should return null when neither player has lost', () => {
        const p1 = createPlayer(alive4(), 0);
        const p2 = createPlayer(alive4(), 1);
        expect(checkWinner(createGameState(p1, p2))).toBeNull();
    });

    it('should return 1 when player 0 has 2+ dead characters', () => {
        const p1 = createPlayer(dead2(), 0);
        const p2 = createPlayer(alive4(), 1);
        expect(checkWinner(createGameState(p1, p2))).toBe(1);
    });

    it('should return 0 when player 1 has 2+ dead characters', () => {
        const p1 = createPlayer(alive4(), 0);
        const p2 = createPlayer(dead2(), 1);
        expect(checkWinner(createGameState(p1, p2))).toBe(0);
    });

    it('should return draw when both players have 2+ dead characters', () => {
        const p1 = createPlayer(dead2(), 0);
        const p2 = createPlayer(dead2(), 1);
        expect(checkWinner(createGameState(p1, p2))).toBe('draw');
    });
});

describe('Round.service stat ticking', () => {
    const instance = (value: number, roundsLeft: number, appliedRound: number) =>
        ({ stat: 'POWER' as const, value, roundsLeft, appliedRound });
    const stateWith = (round: number, modifiers: ReturnType<typeof instance>[]) => {
        const c = createCharacter({ catalogId: TEST_CATALOG_ID, name: "C", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });
        const other = createCharacter({ catalogId: TEST_CATALOG_ID, name: "O", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 1, slot: 0 } });
        return { ...createGameState(createPlayer([{ ...c, modifiers }], 0), createPlayer([other], 1)), currentRound: round };
    };

    it('loses one round per instance applied in an earlier round', () => {
        const after = endOfRound(stateWith(5, [instance(3, 2, 3)]));
        expect(after.players[0].team[0].modifiers).toEqual([instance(3, 1, 3)]);
    });

    it('removes an instance that reaches 0 rounds left', () => {
        const after = endOfRound(stateWith(5, [instance(3, 1, 3), instance(-2, 2, 4)]));
        expect(after.players[0].team[0].modifiers).toEqual([instance(-2, 1, 4)]);
    });

    it('does not tick an instance applied during the round that is ending', () => {
        const after = endOfRound(stateWith(5, [instance(3, 2, 5), instance(-2, 2, 4)]));
        expect(after.players[0].team[0].modifiers).toEqual([instance(3, 2, 5), instance(-2, 1, 4)]);
    });

    it('so a duration d applied in round N is active through round N + d', () => {
        let state = stateWith(5, [instance(3, 2, 5)]);
        const active: boolean[] = [];
        for (let round = 5; round <= 8; round++) {
            active.push(state.players[0].team[0].modifiers.length > 0);
            state = endOfRound(state);
        }
        expect(active).toEqual([true, true, true, false]);
    });
});

describe('Round.service ARMOR ticking', () => {
    const armor = (value: number, roundsLeft: number, appliedRound: number) =>
        ({ stat: 'ARMOR' as const, value, roundsLeft, appliedRound });
    const stateWith = (round: number, modifiers: ReturnType<typeof armor>[]) => {
        const c = createCharacter({ catalogId: TEST_CATALOG_ID, name: "C", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });
        const other = createCharacter({ catalogId: TEST_CATALOG_ID, name: "O", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 1, slot: 0 } });
        return { ...createGameState(createPlayer([{ ...c, modifiers }], 0), createPlayer([other], 1)), currentRound: round };
    };

    it('loses one round per instance applied earlier and is removed at 0', () => {
        const after = endOfRound(stateWith(5, [armor(3, 2, 3), armor(-2, 1, 4)]));
        expect(after.players[0].team[0].modifiers).toEqual([armor(3, 1, 3)]);
    });

    it('does not tick an instance applied during the round that is ending', () => {
        const after = endOfRound(stateWith(5, [armor(3, 2, 5)]));
        expect(after.players[0].team[0].modifiers).toEqual([armor(3, 2, 5)]);
    });
});

describe('Round.service state ticking', () => {
    const stateWith = (round: number, states: Parameters<typeof withStates>[0]) => withStates(states, round);
    function withStates(states: Record<string, { value: number; touchedRound: number }>, round: number) {
        const c = createCharacter({ catalogId: TEST_CATALOG_ID, name: "C", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });
        const other = createCharacter({ catalogId: TEST_CATALOG_ID, name: "O", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 1, slot: 0 } });
        return { ...createGameState(createPlayer([{ ...c, states }], 0), createPlayer([other], 1)), currentRound: round };
    }

    it('moves a positive counter one step toward 0', () => {
        const after = endOfRound(stateWith(5, { STUN: { value: 3, touchedRound: 2 } }));
        expect(after.players[0].team[0].states).toEqual({ STUN: { value: 2, touchedRound: 2 } });
    });

    it('moves a negative counter one step toward 0', () => {
        const after = endOfRound(stateWith(5, { SPEED: { value: -3, touchedRound: 2 } }));
        expect(after.players[0].team[0].states).toEqual({ SPEED: { value: -2, touchedRound: 2 } });
    });

    it('removes an axis that reaches 0', () => {
        const after = endOfRound(stateWith(5, { ROOT: { value: 1, touchedRound: 2 }, SPEED: { value: -1, touchedRound: 2 } }));
        expect(after.players[0].team[0].states).toEqual({});
    });

    it('does not tick an axis touched during the round that is ending', () => {
        const after = endOfRound(stateWith(5, { STUN: { value: 2, touchedRound: 5 }, ROOT: { value: 2, touchedRound: 4 } }));
        expect(after.players[0].team[0].states).toEqual({ STUN: { value: 2, touchedRound: 5 }, ROOT: { value: 1, touchedRound: 4 } });
    });

    it('so a duration d applied in round N is active through round N + d', () => {
        let state = stateWith(5, { STUN: { value: 2, touchedRound: 5 } });
        const active: boolean[] = [];
        for (let round = 5; round <= 8; round++) {
            active.push(state.players[0].team[0].states.STUN !== undefined);
            state = endOfRound(state);
        }
        expect(active).toEqual([true, true, true, false]);
    });
});
