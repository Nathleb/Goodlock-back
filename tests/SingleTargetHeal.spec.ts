import EffectLabel from "@domain/types/EffectLabels.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState, buildEffectFactory } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { SlotIndex } from "@domain/types/Position.type";
import SingleTargetHeal from "@domain/strategies/SingleTargetHeal.class";

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
    createCharacter(name, 20, 5, die, { playerIndex, slot });

function makeGameState() {
    const team1 = ([0, 1, 2, 3, 4] as SlotIndex[]).map(i => makeChar(`A${i}`, 0, i));
    const team2 = ([0, 1, 2, 3, 4] as SlotIndex[]).map(i => makeChar(`B${i}`, 1, i));
    return createGameState(createPlayer(team1, 0), createPlayer(team2, 1));
}

describe('SingleTargetHeal', () => {
    it('heals the target and returns its id in affected', () => {
        const heal = new SingleTargetHeal(8);
        const gs = makeGameState();
        // Damage the target first so heal is observable
        const damagedTeam = gs.players[1].team.map(c => ({ ...c, hp: 10 }));
        const base = { ...gs, players: [gs.players[0], { ...gs.players[1], team: damagedTeam }] as typeof gs.players };
        const target = { playerIndex: 1 as const, slot: 2 as SlotIndex };
        const actorId = base.players[0].team[0].id;

        const { state: updated, affected } = heal.solve(base, target, actorId);

        expect(updated.players[1].team[2].hp).toBe(18); // 10 + 8
        expect(affected).toHaveLength(1);
        expect(affected[0]).toBe(base.players[1].team[2].id);
    });

    it('does not overheal beyond maxHp', () => {
        const heal = new SingleTargetHeal(50);
        const gs = makeGameState();
        const target = { playerIndex: 1 as const, slot: 0 as SlotIndex };
        const actorId = gs.players[0].team[0].id;

        const { state: updated } = heal.solve(gs, target, actorId);

        expect(updated.players[1].team[0].hp).toBe(20); // capped at maxHp
    });

    it('returns empty affected and unchanged state when slot has no character', () => {
        const heal = new SingleTargetHeal(10);
        const gs = makeGameState();
        const emptySlot = { playerIndex: 0 as const, slot: 9 as SlotIndex };
        const actorId = gs.players[0].team[0].id;

        const { state: updated, affected } = heal.solve(gs, emptySlot, actorId);

        expect(affected).toHaveLength(0);
        expect(updated.players).toEqual(gs.players);
    });
});
