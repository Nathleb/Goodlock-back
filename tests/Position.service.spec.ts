import EffectLabel from "@domain/types/EffectLabels.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createPlayer } from "@domain/services/Player.service";
import { findSingleTarget, findSelf } from "@domain/services/Position.service";
import { buildEffectFactory } from "@domain/services/GameInit.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { SlotIndex } from "@domain/types/Position.type";

const factory = buildEffectFactory();

const baseDieInstructions: BaseDieInstructions = [
    { description: "Damage", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 5 }] },
    { description: "Heal",   priority: 1, effects: [{ effect: EffectLabel.SingleTargetHeal,   magnitude: 5 }] },
    { description: "Shield", priority: 1, effects: [{ effect: EffectLabel.SingleTargetShield, magnitude: 5 }] },
    { description: "Damage", priority: 2, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 5 }] },
    { description: "Heal",   priority: 2, effects: [{ effect: EffectLabel.SingleTargetHeal,   magnitude: 5 }] },
    { description: "Shield", priority: 2, effects: [{ effect: EffectLabel.SingleTargetShield, magnitude: 5 }] },
];

const die = generateFullDie(baseDieInstructions, factory);
const makeChar = (name: string, playerIndex: 0 | 1, slot: SlotIndex) =>
    createCharacter(name, 100, 5, die, { playerIndex, slot });

function makePlayers(): [ReturnType<typeof createPlayer>, ReturnType<typeof createPlayer>] {
    const team1 = ([0, 1, 2, 3, 4] as SlotIndex[]).map(i => makeChar(`A${i}`, 0, i));
    const team2 = ([0, 1, 2, 3, 4] as SlotIndex[]).map(i => makeChar(`B${i}`, 1, i));
    return [createPlayer(team1, 0), createPlayer(team2, 1)];
}

describe('findSingleTarget', () => {
    it('returns the character at the given position', () => {
        const players = makePlayers();
        const result = findSingleTarget(players, { playerIndex: 0, slot: 2 });
        expect(result).toHaveLength(1);
        expect(result[0].position).toEqual({ playerIndex: 0, slot: 2 });
    });

    it('returns empty array when slot has no character', () => {
        const players = makePlayers();
        const result = findSingleTarget(players, { playerIndex: 0, slot: 9 as SlotIndex });
        expect(result).toHaveLength(0);
    });
});

describe('findSelf', () => {
    it('returns empty array when actorId is not in either team', () => {
        const players = makePlayers();
        const result = findSelf(players, 'nonexistent-id');
        expect(result).toHaveLength(0);
    });
});
