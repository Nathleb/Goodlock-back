import { SlotIndex } from "@domain/types/Position.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState, initializeEffects } from "@domain/services/GameInit.service";
import { createPlayer, rearrangeTeam } from "@domain/services/Player.service";
import {
    assertPhase,
    beginPlacementPhase, beginRollPhase, beginKeepPhase,
    beginAssignPhase, beginResolvePhase, beginResultPhase,
} from "@domain/services/Phase.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import EffectLabel from "@domain/types/EffectLabels.type";
import GamePhase from "@domain/types/GamePhase.type";

initializeEffects();

const die = generateFullDie([
    { description: "A", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "B", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "C", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "E", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "F", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
] satisfies BaseDieInstructions);

const team1 = [0, 1, 2, 3, 4].map(i => createCharacter(`P1-${i}`, 100, 1, die, { playerIndex: 0, slot: i as SlotIndex }));
const team2 = [0, 1, 2, 3, 4].map(i => createCharacter(`P2-${i}`, 100, 1, die, { playerIndex: 1, slot: i as SlotIndex }));
const gs = createGameState(createPlayer(team1, 0), createPlayer(team2, 1));

describe('Phase transitions', () => {
    it('initial phase is PLACEMENT_PHASE', () => {
        expect(gs.phase).toBe(GamePhase.PLACEMENT);
    });

    it('each beginX function sets the correct phase', () => {
        expect(beginPlacementPhase(gs).phase).toBe(GamePhase.PLACEMENT);
        expect(beginRollPhase(gs).phase).toBe(GamePhase.ROLL);
        expect(beginKeepPhase(gs).phase).toBe(GamePhase.KEEP);
        expect(beginAssignPhase(gs).phase).toBe(GamePhase.ASSIGN);
        expect(beginResolvePhase(gs).phase).toBe(GamePhase.RESOLVE);
        expect(beginResultPhase(gs).phase).toBe(GamePhase.RESULT);
    });

    it('phase transitions are immutable', () => {
        const updated = beginRollPhase(gs);
        expect(gs.phase).toBe(GamePhase.PLACEMENT);
        expect(updated.phase).toBe(GamePhase.ROLL);
    });
});

describe('assertPhase', () => {
    it('does not throw when phase matches', () => {
        expect(() => assertPhase(gs, GamePhase.PLACEMENT)).not.toThrow();
    });

    it('throws when phase does not match', () => {
        expect(() => assertPhase(gs, GamePhase.ROLL)).toThrow();
    });
});

describe('rearrangeTeam', () => {
    const player = createPlayer(team1, 0);
    const names = () => player.team.map(c => c.name);

    it('reorders characters according to the given slot order', () => {
        const reordered = rearrangeTeam(player, [4, 3, 2, 1, 0]);
        expect(reordered.team.map(c => c.name)).toEqual([...names()].reverse());
    });

    it('updates position.slot to match the new index', () => {
        const reordered = rearrangeTeam(player, [4, 3, 2, 1, 0]);
        reordered.team.forEach((char, i) => {
            expect(char.position.slot).toBe(i);
        });
    });

    it('identity order leaves the team unchanged', () => {
        const reordered = rearrangeTeam(player, [0, 1, 2, 3, 4]);
        expect(reordered.team.map(c => c.name)).toEqual(names());
    });

    it('does not mutate the original player', () => {
        rearrangeTeam(player, [4, 3, 2, 1, 0]);
        expect(player.team.map(c => c.name)).toEqual(names());
    });
});
