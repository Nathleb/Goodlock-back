import Position, { SlotIndex } from "@domain/types/Position.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState, buildEffectFactory } from "@domain/services/GameInit.service";
import { selectTargetOfCharacter, createPlayer } from "@domain/services/Player.service";
import { addEffectsToPriorityQueue, createPriorityQueue, unstackPriorityQueueWithLog } from "@domain/services/PriorityQueue.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import EffectLabel from "@domain/types/EffectLabels.type";
import GameState from "@domain/types/GameState.type";
import { PlayerIndex } from "@domain/types/Position.type";
import TargetConstraint from "@domain/types/TargetConstraint.type";

const baseDieInstructions: BaseDieInstructions = [
    { description: "Damage",      priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 5 }], targetConstraint: TargetConstraint.ENEMY_ONLY },
    { description: "SwapAlly",    priority: 1, effects: [{ effect: EffectLabel.SwapAlly,           magnitude: 0 }], targetConstraint: TargetConstraint.ALLY_ONLY },
    { description: "PushLeft1",   priority: 1, effects: [{ effect: EffectLabel.PushLeft,            magnitude: 1 }], targetConstraint: TargetConstraint.ANY },
    { description: "PushRight1",  priority: 1, effects: [{ effect: EffectLabel.PushRight,           magnitude: 1 }], targetConstraint: TargetConstraint.ANY },
    { description: "MoveToSlot2", priority: 1, effects: [{ effect: EffectLabel.MoveToSlot,          magnitude: 2 }], targetConstraint: TargetConstraint.ANY },
    { description: "PushLeft2",   priority: 2, effects: [{ effect: EffectLabel.PushLeft,            magnitude: 2 }], targetConstraint: TargetConstraint.ANY },
];

const factory = buildEffectFactory();
const die = generateFullDie(baseDieInstructions, factory);
const makeChar = (name: string) => createCharacter(name, 100, 5, die, { playerIndex: 0, slot: 0 });

const team1 = [makeChar("A"), makeChar("B"), makeChar("C"), makeChar("D"), makeChar("E")];
const team2 = [makeChar("V"), makeChar("W"), makeChar("X"), makeChar("Y"), makeChar("Z")];
const player1 = createPlayer(team1, 0);
const player2 = createPlayer(team2, 1);

function resolve(
    gs: GameState,
    actorId: string,
    faceIndex: number,
    targetPlayerIndex: PlayerIndex,
    targetSlot: SlotIndex,
): GameState {
    const actor = gs.players.flatMap(p => p.team).find(c => c.id === actorId)!;
    const state = {
        ...gs,
        priorityQueue: addEffectsToPriorityQueue(
            createPriorityQueue(10),
            actor.baseDie[faceIndex],
            { playerIndex: targetPlayerIndex, slot: targetSlot },
            actorId,
            actor.baseSpeed,
        ),
    };
    return unstackPriorityQueueWithLog(state).state;
}

function resolveEffect(
    gs: GameState,
    actorId: string,
    label: EffectLabel,
    magnitude: number,
    targetPlayerIndex: PlayerIndex,
    targetSlot: SlotIndex,
): ReturnType<typeof unstackPriorityQueueWithLog> {
    const actor = gs.players.flatMap(p => p.team).find(c => c.id === actorId)!;
    const emptyFace = { description: '-', priority: 1, effects: [] };
    const face = generateFullDie([
        { description: 'test', priority: 1, effects: [{ effect: label, magnitude }] },
        emptyFace, emptyFace, emptyFace, emptyFace, emptyFace,
    ], factory)[0];
    const state = {
        ...gs,
        priorityQueue: addEffectsToPriorityQueue(
            createPriorityQueue(10),
            face,
            { playerIndex: targetPlayerIndex, slot: targetSlot },
            actorId,
            actor.baseSpeed,
        ),
    };
    return unstackPriorityQueueWithLog(state);
}

describe('SwapAlly', () => {
    it('swaps actor with targeted ally', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0]; // slot 0
        const charB = gs.players[0].team[1]; // slot 1

        const result = resolve(gs, charB.id, 1, 0, 0); // charB targets slot 0 (charA)

        expect(result.players[0].team[0].id).toBe(charB.id);
        expect(result.players[0].team[1].id).toBe(charA.id);
    });

    it('preserves position.slot after swap', () => {
        const gs = createGameState(player1, player2);
        const charB = gs.players[0].team[1];

        const result = resolve(gs, charB.id, 1, 0, 0);

        expect(result.players[0].team[0].position.slot).toBe(0);
        expect(result.players[0].team[1].position.slot).toBe(1);
    });

    it('throws ALLY_ONLY error when attempting to assign enemy target to SwapAlly face', () => {
        const swapAllyFace = die[1]; // face index 1 is SwapAlly
        const withSwapFace = { ...team1[0], face: swapAllyFace };
        const player = { ...player1, team: player1.team.map((c, i) => i === 0 ? withSwapFace : c) };
        const enemyPos: Position = { playerIndex: 1, slot: 2 };
        expect(() => selectTargetOfCharacter(player, 0 as SlotIndex, enemyPos)).toThrow('ALLY_ONLY');
    });

    it('is a no-op when actor targets their own slot', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charA.id, 1, 0, 0); // self-target

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('does not affect the opponent team', () => {
        const gs = createGameState(player1, player2);
        const charB = gs.players[0].team[1];
        const before = gs.players[1].team.map(c => c.id);

        const result = resolve(gs, charB.id, 1, 0, 0);

        expect(result.players[1].team.map(c => c.id)).toEqual(before);
    });

    it('only moves the two swapped slots, leaving others unchanged', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const charE = gs.players[0].team[4];

        const result = resolve(gs, charE.id, 1, 0, 0); // charE swaps with charA

        expect(result.players[0].team[1].id).toBe(gs.players[0].team[1].id);
        expect(result.players[0].team[2].id).toBe(gs.players[0].team[2].id);
        expect(result.players[0].team[3].id).toBe(gs.players[0].team[3].id);
        expect(result.players[0].team[0].id).toBe(charE.id);
        expect(result.players[0].team[4].id).toBe(charA.id);
    });

    it('works with a dead ally', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const deadB = { ...gs.players[0].team[1], hp: 0 };
        const gsWithDead = {
            ...gs,
            players: [
                { ...gs.players[0], team: [charA, deadB, ...gs.players[0].team.slice(2)] },
                gs.players[1],
            ] as typeof gs.players,
        };

        const { state } = resolveEffect(gsWithDead, charA.id, EffectLabel.SwapAlly, 0, 0, 1);

        expect(state.players[0].team[1].id).toBe(charA.id);
        expect(state.players[0].team[0].id).toBe(deadB.id);
    });

    it('log reports both affected character IDs', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const charB = gs.players[0].team[1];

        const { log } = resolveEffect(gs, charB.id, EffectLabel.SwapAlly, 0, 0, 0);

        expect(log[0].changes.map(c => c.characterId)).toEqual(
            expect.arrayContaining([charA.id, charB.id])
        );
    });
});

describe('Push', () => {
    it('PushLeft moves target one slot to the left', () => {
        const gs = createGameState(player1, player2);
        const charB = gs.players[0].team[1]; // slot 1
        const charA = gs.players[0].team[0]; // slot 0

        const result = resolve(gs, charB.id, 2, 0, 1); // push charB (slot 1) left

        expect(result.players[0].team[0].id).toBe(charB.id);
        expect(result.players[0].team[1].id).toBe(charA.id);
    });

    it('PushRight moves target one slot to the right', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0]; // slot 0
        const charB = gs.players[0].team[1]; // slot 1

        const result = resolve(gs, charA.id, 3, 0, 0); // push charA (slot 0) right

        expect(result.players[0].team[1].id).toBe(charA.id);
        expect(result.players[0].team[0].id).toBe(charB.id);
    });

    it('PushLeft is a no-op at slot 0 (boundary)', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charA.id, 2, 0, 0); // push slot 0 left

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('PushRight is a no-op at last slot (boundary)', () => {
        const gs = createGameState(player1, player2);
        const charE = gs.players[0].team[4];
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charE.id, 3, 0, 4); // push slot 4 right

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('PushLeft with magnitude 2 moves target two slots left', () => {
        const gs = createGameState(player1, player2);
        const charC = gs.players[0].team[2]; // slot 2
        const charA = gs.players[0].team[0]; // slot 0

        const result = resolve(gs, charC.id, 5, 0, 2); // face 5: PushLeft magnitude 2

        expect(result.players[0].team[0].id).toBe(charC.id);
        expect(result.players[0].team[2].id).toBe(charA.id);
    });

    it('PushLeft magnitude 2 is a no-op when it would exceed boundary', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0]; // slot 0 — push by 2 would land at -2
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charA.id, 5, 0, 0);

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('push can target an enemy and moves them within their own team', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const enemyB = gs.players[1].team[1]; // slot 1 on opponent team
        const enemyA = gs.players[1].team[0]; // slot 0

        const result = resolve(gs, charA.id, 2, 1, 1); // push enemy slot 1 left

        expect(result.players[1].team[0].id).toBe(enemyB.id);
        expect(result.players[1].team[1].id).toBe(enemyA.id);
    });

    it('pushing an enemy does not affect own team', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charA.id, 2, 1, 1); // push enemy

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('PushRight with magnitude 2 moves target two slots right', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0]; // slot 0
        const charC = gs.players[0].team[2]; // slot 2

        const { state } = resolveEffect(gs, charA.id, EffectLabel.PushRight, 2, 0, 0);

        expect(state.players[0].team[2].id).toBe(charA.id);
        expect(state.players[0].team[0].id).toBe(charC.id);
    });

    it('PushRight magnitude 2 is a no-op when it would exceed boundary', () => {
        const gs = createGameState(player1, player2);
        const charE = gs.players[0].team[4]; // slot 4 — push right by 2 would be slot 6
        const before = gs.players[0].team.map(c => c.id);

        const { state } = resolveEffect(gs, charE.id, EffectLabel.PushRight, 2, 0, 4);

        expect(state.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('push preserves position.slot on both affected characters', () => {
        const gs = createGameState(player1, player2);
        const charB = gs.players[0].team[1]; // slot 1 → pushed left to slot 0

        const { state } = resolveEffect(gs, charB.id, EffectLabel.PushLeft, 1, 0, 1);

        expect(state.players[0].team[0].position.slot).toBe(0);
        expect(state.players[0].team[1].position.slot).toBe(1);
    });

    it('push only moves the two involved slots, leaving others unchanged', () => {
        const gs = createGameState(player1, player2);
        const charC = gs.players[0].team[2]; // slot 2 — pushed right

        const { state } = resolveEffect(gs, charC.id, EffectLabel.PushRight, 1, 0, 2);

        expect(state.players[0].team[0].id).toBe(gs.players[0].team[0].id);
        expect(state.players[0].team[1].id).toBe(gs.players[0].team[1].id);
        expect(state.players[0].team[4].id).toBe(gs.players[0].team[4].id);
    });
});

describe('MoveToSlot', () => {
    it('moves targeted character to the fixed destination slot', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0]; // slot 0 — will be moved to slot 2
        const charC = gs.players[0].team[2]; // slot 2 — will be displaced to slot 0

        const result = resolve(gs, charA.id, 4, 0, 0); // face 4: MoveToSlot magnitude 2, target slot 0

        expect(result.players[0].team[2].id).toBe(charA.id);
        expect(result.players[0].team[0].id).toBe(charC.id);
    });

    it('is a no-op when target is already at the destination slot', () => {
        const gs = createGameState(player1, player2);
        const charC = gs.players[0].team[2];
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charC.id, 4, 0, 2); // target at slot 2, destination is slot 2

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('can move an enemy to the fixed destination slot within their team', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const enemyA = gs.players[1].team[0]; // slot 0 — moved to slot 2
        const enemyC = gs.players[1].team[2]; // slot 2 — displaced

        const result = resolve(gs, charA.id, 4, 1, 0); // target enemy slot 0, move to slot 2

        expect(result.players[1].team[2].id).toBe(enemyA.id);
        expect(result.players[1].team[0].id).toBe(enemyC.id);
    });

    it('is a no-op when destination slot is out of bounds', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const before = gs.players[0].team.map(c => c.id);

        const { state } = resolveEffect(gs, charA.id, EffectLabel.MoveToSlot, 5, 0, 0); // slot 5 doesn't exist

        expect(state.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('can move from a high slot to a low slot', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const charE = gs.players[0].team[4]; // slot 4 — moved to slot 0

        const { state } = resolveEffect(gs, charA.id, EffectLabel.MoveToSlot, 0, 0, 4); // target slot 4, destination 0

        expect(state.players[0].team[0].id).toBe(charE.id);
        expect(state.players[0].team[4].id).toBe(charA.id);
    });

    it('preserves position.slot on both affected characters', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];

        const { state } = resolveEffect(gs, charA.id, EffectLabel.MoveToSlot, 3, 0, 0); // move slot 0 → slot 3

        expect(state.players[0].team[3].position.slot).toBe(3);
        expect(state.players[0].team[0].position.slot).toBe(0);
    });

    it('only moves the two involved slots, leaving others unchanged', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];

        const { state } = resolveEffect(gs, charA.id, EffectLabel.MoveToSlot, 4, 0, 0); // slot 0 ↔ slot 4

        expect(state.players[0].team[1].id).toBe(gs.players[0].team[1].id);
        expect(state.players[0].team[2].id).toBe(gs.players[0].team[2].id);
        expect(state.players[0].team[3].id).toBe(gs.players[0].team[3].id);
    });

    it('moving an ally does not affect the opponent team', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const before = gs.players[1].team.map(c => c.id);

        const { state } = resolveEffect(gs, charA.id, EffectLabel.MoveToSlot, 4, 0, 0);

        expect(state.players[1].team.map(c => c.id)).toEqual(before);
    });
});
