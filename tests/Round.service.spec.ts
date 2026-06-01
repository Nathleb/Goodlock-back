import EffectLabel from "@domain/types/EffectLabels.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { gainShield, loseHp, setTarget } from "@domain/services/Character.service";
import { createGameState, buildEffectFactory } from "@domain/services/GameInit.service";
import { createPlayer, toggleDieLockForCharacter } from "@domain/services/Player.service";
import { endOfRound, checkWinner } from "@domain/services/Round.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { Player } from "@domain/types/Player.type";

const baseDieInstructions: BaseDieInstructions = [
    { description: "Damage", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 5 }] },
    { description: "Heal", priority: 1, effects: [{ effect: EffectLabel.SingleTargetHeal, magnitude: 5 }] },
    { description: "Shield", priority: 1, effects: [{ effect: EffectLabel.SingleTargetShield, magnitude: 5 }] },
    { description: "Damage", priority: 2, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 5 }] },
    { description: "Heal", priority: 2, effects: [{ effect: EffectLabel.SingleTargetHeal, magnitude: 5 }] },
    { description: "Shield", priority: 2, effects: [{ effect: EffectLabel.SingleTargetShield, magnitude: 5 }] },
];

const factory = buildEffectFactory();
const die = generateFullDie(baseDieInstructions, factory);

describe('Round.service', () => {
    it('should reset all shields to 0 at end of round', () => {
        const makeChar = () => createCharacter("C", 100, 5, die, { playerIndex: 0, slot: 0 });
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
        const makeChar = () => createCharacter("C", 100, 5, die, { playerIndex: 0, slot: 0 });
        const player1 = createPlayer([makeChar(), makeChar(), makeChar(), makeChar(), makeChar()], 0);
        const player2 = createPlayer([makeChar(), makeChar(), makeChar(), makeChar(), makeChar()], 1);
        const gameState = createGameState(player1, player2);

        const updated = endOfRound(gameState);

        updated.players.forEach(player =>
            player.team.forEach(char => expect(char.hp).toBe(100))
        );
    });

    it('should increment currentRound', () => {
        const makeChar = () => createCharacter("C", 100, 5, die, { playerIndex: 0, slot: 0 });
        const player1 = createPlayer([makeChar(), makeChar(), makeChar(), makeChar(), makeChar()], 0);
        const player2 = createPlayer([makeChar(), makeChar(), makeChar(), makeChar(), makeChar()], 1);
        const gameState = createGameState(player1, player2);

        const updated = endOfRound(gameState);

        expect(updated.currentRound).toBe(gameState.currentRound + 1);
    });

    it('should reset rollsLeft to 2', () => {
        const makeChar = () => createCharacter("C", 100, 5, die, { playerIndex: 0, slot: 0 });
        const player1 = createPlayer([makeChar(), makeChar(), makeChar(), makeChar(), makeChar()], 0);
        const player2 = createPlayer([makeChar(), makeChar(), makeChar(), makeChar(), makeChar()], 1);
        const gameState = { ...createGameState(player1, player2), rollsLeft: 0 };

        const updated = endOfRound(gameState);

        expect(updated.rollsLeft).toBe(2);
    });

    it('should reset all targets to null', () => {
        const makeChar = () => createCharacter("C", 100, 5, die, { playerIndex: 0, slot: 0 });
        const withTarget = setTarget(makeChar(), { playerIndex: 1, slot: 2 });
        const player1 = createPlayer([withTarget, makeChar(), makeChar(), makeChar(), makeChar()], 0);
        const player2 = createPlayer([makeChar(), withTarget, makeChar(), makeChar(), makeChar()], 1);
        const gameState = createGameState(player1, player2);

        const updated = endOfRound(gameState);

        updated.players.forEach(player =>
            player.team.forEach(char => expect(char.target).toBeNull())
        );
    });

    it('should unlock all dice', () => {
        const makeChar = () => createCharacter("C", 100, 5, die, { playerIndex: 0, slot: 0 });
        let player1 = createPlayer([makeChar(), makeChar(), makeChar(), makeChar(), makeChar()], 0);
        let player2 = createPlayer([makeChar(), makeChar(), makeChar(), makeChar(), makeChar()], 1);
        player1 = toggleDieLockForCharacter(player1, { playerIndex: 0, slot: 0 });
        player2 = toggleDieLockForCharacter(player2, { playerIndex: 1, slot: 2 });
        const gameState = createGameState(player1, player2);

        const updated = endOfRound(gameState);

        updated.players.forEach(player =>
            player.team.forEach(char => expect(char.isFaceLocked).toBe(false))
        );
    });
});

describe('checkWinner', () => {
    const makeChar = () => createCharacter("C", 100, 5, die, { playerIndex: 0, slot: 0 });
    const dead = () => loseHp(makeChar(), 100);
    const alive5 = () => [makeChar(), makeChar(), makeChar(), makeChar(), makeChar()];
    const dead3 = () => [dead(), dead(), dead(), makeChar(), makeChar()];

    it('should return null when neither player has lost', () => {
        const p1 = createPlayer(alive5(), 0);
        const p2 = createPlayer(alive5(), 1);
        expect(checkWinner(createGameState(p1, p2))).toBeNull();
    });

    it('should return 1 when player 0 has 3+ dead characters', () => {
        const p1 = createPlayer(dead3(), 0);
        const p2 = createPlayer(alive5(), 1);
        expect(checkWinner(createGameState(p1, p2))).toBe(1);
    });

    it('should return 0 when player 1 has 3+ dead characters', () => {
        const p1 = createPlayer(alive5(), 0);
        const p2 = createPlayer(dead3(), 1);
        expect(checkWinner(createGameState(p1, p2))).toBe(0);
    });

    it('should return draw when both players have 3+ dead characters', () => {
        const p1 = createPlayer(dead3(), 0);
        const p2 = createPlayer(dead3(), 1);
        expect(checkWinner(createGameState(p1, p2))).toBe('draw');
    });
});
