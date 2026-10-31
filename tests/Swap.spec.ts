import { TEST_CATALOG_ID } from './helpers/catalog';
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import { addEffectsToPriorityQueue, createPriorityQueue, unstackPriorityQueueWithLog } from "@domain/services/PriorityQueue.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import EffectLabel from "@domain/types/EffectLabels.type";
import GameState from "@domain/types/GameState.type";
import TargetGroup from "@domain/types/TargetGroup.type";
import { enemyAbs, allyAbs, allyRel } from "./helpers/targets";

// Each face carries its own cells. Actor-relative faces reproduce the old
// "actor pushes / moves itself" fixtures; one-off faces cover specific targets.
const baseDieInstructions: BaseDieInstructions = [
    { description: "Damage",       priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyAbs(0)] }] },
    { description: "Swap with 0",  priority: 1, effects: [{ effect: EffectLabel.Swap,   magnitude: 0, targets: [allyRel(0), allyAbs(0)] }] },
    { description: "Push left 1",  priority: 1, effects: [{ effect: EffectLabel.Swap,   magnitude: 0, targets: [allyRel(0, -1)] }] },
    { description: "Push right 1", priority: 1, effects: [{ effect: EffectLabel.Swap,   magnitude: 0, targets: [allyRel(0, 1)] }] },
    { description: "Move to 2",    priority: 1, effects: [{ effect: EffectLabel.Swap,   magnitude: 0, targets: [allyRel(0), allyAbs(2)] }] },
    { description: "Push left 2",  priority: 2, effects: [{ effect: EffectLabel.Swap,   magnitude: 0, targets: [allyRel(0, -2)] }] },
];

const die = generateFullDie(baseDieInstructions);
const makeChar = (name: string) => createCharacter({ catalogId: TEST_CATALOG_ID, name, maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });

const team1 = [makeChar("A"), makeChar("B"), makeChar("C"), makeChar("D"), makeChar("E")];
const team2 = [makeChar("V"), makeChar("W"), makeChar("X"), makeChar("Y"), makeChar("Z")];
const player1 = createPlayer(team1, 0);
const player2 = createPlayer(team2, 1);

function resolve(gs: GameState, actorId: string, faceIndex: number): GameState {
    const actor = gs.players.flatMap(p => p.team).find(c => c.id === actorId)!;
    const state = {
        ...gs,
        priorityQueue: addEffectsToPriorityQueue(createPriorityQueue(), actor.baseDie[faceIndex], actorId, actor.baseSpeed),
    };
    return unstackPriorityQueueWithLog(state).state;
}

function resolveSwap(gs: GameState, actorId: string, targets: TargetGroup[]): ReturnType<typeof unstackPriorityQueueWithLog> {
    const actor = gs.players.flatMap(p => p.team).find(c => c.id === actorId)!;
    const emptyFace = { description: '-', priority: 1, effects: [] };
    const face = generateFullDie([
        { description: 'test', priority: 1, effects: [{ effect: EffectLabel.Swap, magnitude: 0, targets }] },
        emptyFace, emptyFace, emptyFace, emptyFace, emptyFace,
    ])[0];
    const state = {
        ...gs,
        priorityQueue: addEffectsToPriorityQueue(createPriorityQueue(), face, actorId, actor.baseSpeed),
    };
    return unstackPriorityQueueWithLog(state);
}

describe('Swap: actor with an ally', () => {
    it('swaps actor with targeted ally', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0]; // slot 0
        const charB = gs.players[0].team[1]; // slot 1

        const result = resolve(gs, charB.id, 1); // charB swaps with slot 0 (charA)

        expect(result.players[0].team[0].id).toBe(charB.id);
        expect(result.players[0].team[1].id).toBe(charA.id);
    });

    it('preserves position.slot after swap', () => {
        const gs = createGameState(player1, player2);
        const charB = gs.players[0].team[1];

        const result = resolve(gs, charB.id, 1);

        expect(result.players[0].team[0].position.slot).toBe(0);
        expect(result.players[0].team[1].position.slot).toBe(1);
    });

    it('is a no-op when actor targets their own slot', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charA.id, 1); // both cells are slot 0

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('does not affect the opponent team', () => {
        const gs = createGameState(player1, player2);
        const charB = gs.players[0].team[1];
        const before = gs.players[1].team.map(c => c.id);

        const result = resolve(gs, charB.id, 1);

        expect(result.players[1].team.map(c => c.id)).toEqual(before);
    });

    it('only moves the two swapped slots, leaving others unchanged', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const charE = gs.players[0].team[4];

        const result = resolve(gs, charE.id, 1); // charE swaps with charA

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

        const { state } = resolveSwap(gsWithDead, charA.id, [allyRel(0), allyAbs(1)]);

        expect(state.players[0].team[1].id).toBe(charA.id);
        expect(state.players[0].team[0].id).toBe(deadB.id);
    });

    it('log reports both affected character IDs', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const charB = gs.players[0].team[1];

        const { log } = resolveSwap(gs, charB.id, [allyRel(0), allyAbs(0)]);

        expect(log[0].changes.map(c => c.characterId)).toEqual(
            expect.arrayContaining([charA.id, charB.id])
        );
    });
});

describe('Swap: push patterns', () => {
    it('push-left moves target one slot to the left', () => {
        const gs = createGameState(player1, player2);
        const charB = gs.players[0].team[1]; // slot 1
        const charA = gs.players[0].team[0]; // slot 0

        const result = resolve(gs, charB.id, 2); // charB (slot 1) pushes itself left

        expect(result.players[0].team[0].id).toBe(charB.id);
        expect(result.players[0].team[1].id).toBe(charA.id);
    });

    it('push-right moves target one slot to the right', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0]; // slot 0
        const charB = gs.players[0].team[1]; // slot 1

        const result = resolve(gs, charA.id, 3); // charA (slot 0) pushes itself right

        expect(result.players[0].team[1].id).toBe(charA.id);
        expect(result.players[0].team[0].id).toBe(charB.id);
    });

    it('push-left is a no-op at slot 0 (boundary)', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charA.id, 2); // slot -1 is off-board → fizzles

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('push-right is a no-op at last slot (boundary)', () => {
        const gs = createGameState(player1, player2);
        const charE = gs.players[0].team[4];
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charE.id, 3); // slot 5 is off-board → fizzles

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('push-left by 2 moves target two slots left', () => {
        const gs = createGameState(player1, player2);
        const charC = gs.players[0].team[2]; // slot 2
        const charA = gs.players[0].team[0]; // slot 0

        const result = resolve(gs, charC.id, 5); // face 5: push left 2

        expect(result.players[0].team[0].id).toBe(charC.id);
        expect(result.players[0].team[2].id).toBe(charA.id);
    });

    it('push-left by 2 is a no-op when it would exceed boundary', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0]; // slot 0 — push by 2 would land at -2
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charA.id, 5);

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('push can target an enemy and moves them within their own team', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const enemyB = gs.players[1].team[1]; // slot 1 on opponent team
        const enemyA = gs.players[1].team[0]; // slot 0

        const { state } = resolveSwap(gs, charA.id, [enemyAbs(1, 0)]); // push enemy slot 1 left

        expect(state.players[1].team[0].id).toBe(enemyB.id);
        expect(state.players[1].team[1].id).toBe(enemyA.id);
    });

    it('pushing an enemy does not affect own team', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const before = gs.players[0].team.map(c => c.id);

        const { state } = resolveSwap(gs, charA.id, [enemyAbs(1, 0)]); // push enemy

        expect(state.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('push-right by 2 moves target two slots right', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0]; // slot 0
        const charC = gs.players[0].team[2]; // slot 2

        const { state } = resolveSwap(gs, charA.id, [allyAbs(0, 2)]);

        expect(state.players[0].team[2].id).toBe(charA.id);
        expect(state.players[0].team[0].id).toBe(charC.id);
    });

    it('push-right by 2 is a no-op when it would exceed boundary', () => {
        const gs = createGameState(player1, player2);
        const charE = gs.players[0].team[4]; // slot 4 — push right by 2 would be slot 6
        const before = gs.players[0].team.map(c => c.id);

        const { state } = resolveSwap(gs, charE.id, [allyRel(0, 2)]);

        expect(state.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('push preserves position.slot on both affected characters', () => {
        const gs = createGameState(player1, player2);
        const charB = gs.players[0].team[1]; // slot 1 → pushed left to slot 0

        const { state } = resolveSwap(gs, charB.id, [allyAbs(1, 0)]);

        expect(state.players[0].team[0].position.slot).toBe(0);
        expect(state.players[0].team[1].position.slot).toBe(1);
    });

    it('push only moves the two involved slots, leaving others unchanged', () => {
        const gs = createGameState(player1, player2);
        const charC = gs.players[0].team[2]; // slot 2 — pushed right

        const { state } = resolveSwap(gs, charC.id, [allyAbs(2, 3)]);

        expect(state.players[0].team[0].id).toBe(gs.players[0].team[0].id);
        expect(state.players[0].team[1].id).toBe(gs.players[0].team[1].id);
        expect(state.players[0].team[4].id).toBe(gs.players[0].team[4].id);
    });
});

describe('Swap: move to a fixed slot', () => {
    it('moves targeted character to the fixed destination slot', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0]; // slot 0 — will be moved to slot 2
        const charC = gs.players[0].team[2]; // slot 2 — will be displaced to slot 0

        const result = resolve(gs, charA.id, 4); // face 4: move self to slot 2

        expect(result.players[0].team[2].id).toBe(charA.id);
        expect(result.players[0].team[0].id).toBe(charC.id);
    });

    it('is a no-op when target is already at the destination slot', () => {
        const gs = createGameState(player1, player2);
        const charC = gs.players[0].team[2];
        const before = gs.players[0].team.map(c => c.id);

        const result = resolve(gs, charC.id, 4); // actor at slot 2, destination is slot 2

        expect(result.players[0].team.map(c => c.id)).toEqual(before);
    });

    it('can move an enemy to the fixed destination slot within their team', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const enemyA = gs.players[1].team[0]; // slot 0 — moved to slot 2
        const enemyC = gs.players[1].team[2]; // slot 2 — displaced

        const { state } = resolveSwap(gs, charA.id, [enemyAbs(0, 2)]);

        expect(state.players[1].team[2].id).toBe(enemyA.id);
        expect(state.players[1].team[0].id).toBe(enemyC.id);
    });

    it('can move from a high slot to a low slot', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const charE = gs.players[0].team[4]; // slot 4 — moved to slot 0

        const { state } = resolveSwap(gs, charA.id, [allyAbs(4, 0)]);

        expect(state.players[0].team[0].id).toBe(charE.id);
        expect(state.players[0].team[4].id).toBe(charA.id);
    });

    it('preserves position.slot on both affected characters', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];

        const { state } = resolveSwap(gs, charA.id, [allyAbs(0, 3)]); // move slot 0 → slot 3

        expect(state.players[0].team[3].position.slot).toBe(3);
        expect(state.players[0].team[0].position.slot).toBe(0);
    });

    it('only moves the two involved slots, leaving others unchanged', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];

        const { state } = resolveSwap(gs, charA.id, [allyAbs(0, 4)]); // slot 0 ↔ slot 4

        expect(state.players[0].team[1].id).toBe(gs.players[0].team[1].id);
        expect(state.players[0].team[2].id).toBe(gs.players[0].team[2].id);
        expect(state.players[0].team[3].id).toBe(gs.players[0].team[3].id);
    });

    it('moving an ally does not affect the opponent team', () => {
        const gs = createGameState(player1, player2);
        const charA = gs.players[0].team[0];
        const before = gs.players[1].team.map(c => c.id);

        const { state } = resolveSwap(gs, charA.id, [allyAbs(0, 4)]);

        expect(state.players[1].team.map(c => c.id)).toEqual(before);
    });
});
