import EffectLabel from "@domain/types/EffectLabels.type";
import { SlotIndex } from "@domain/types/Position.type";
import GamePhase from "@domain/types/GamePhase.type";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState, initializeEffects } from "@domain/services/GameInit.service";
import { createPlayer, toggleDieLockForCharacter } from "@domain/services/Player.service";
import { beginKeepPhase, beginRollPhase, beginAssignPhase } from "@domain/services/Phase.service";
import {
    confirmPlacement, performRoll, confirmKeep, confirmAssignment, performResolve,
    cancelPlacement, cancelKeep, cancelAssignment,
} from "@domain/services/GameLoop.service";
import { Player } from "@domain/types/Player.type";
import GameState from "@domain/types/GameState.type";

initializeEffects();

const die = generateFullDie([
    { description: "A", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "B", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "C", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "E", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "F", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
] satisfies BaseDieInstructions);

const makeTeam = (pi: 0 | 1) =>
    createPlayer([0, 1, 2, 3, 4].map(i => createCharacter("C", 100, 1, die, { playerIndex: pi, slot: i as SlotIndex })), pi);

const gs = createGameState(makeTeam(0), makeTeam(1));

function lockAllPlayers(state: GameState): GameState {
    const lockPlayer = (p: Player): Player => ({
        ...p,
        team: p.team.map(c => ({ ...c, isFaceLocked: true })),
    });
    return { ...state, players: [lockPlayer(state.players[0]), lockPlayer(state.players[1])] };
}

describe('confirmPlacement', () => {
    it('marks player 0 ready but stays in PLACEMENT', () => {
        const result = confirmPlacement(gs, 0);
        expect(result.phase).toBe(GamePhase.PLACEMENT);
        expect(result.playersReady[0]).toBe(true);
        expect(result.playersReady[1]).toBe(false);
    });

    it('marks player 1 ready but stays in PLACEMENT', () => {
        const result = confirmPlacement(gs, 1);
        expect(result.phase).toBe(GamePhase.PLACEMENT);
        expect(result.playersReady[1]).toBe(true);
        expect(result.playersReady[0]).toBe(false);
    });

    it('transitions to ROLL and resets playersReady when both confirm', () => {
        const after0 = confirmPlacement(gs, 0);
        const result = confirmPlacement(after0, 1);
        expect(result.phase).toBe(GamePhase.ROLL);
        expect(result.playersReady).toEqual([false, false]);
    });

    it('throws when called outside PLACEMENT phase', () => {
        expect(() => confirmPlacement(beginRollPhase(gs), 0)).toThrow();
    });
});

describe('performRoll', () => {
    it('transitions to KEEP and resets playersReady', () => {
        const inRoll = beginRollPhase(gs);
        const result = performRoll(inRoll);
        expect(result.phase).toBe(GamePhase.KEEP);
        expect(result.playersReady).toEqual([false, false]);
    });


    it('does not mutate the original state', () => {
        const inRoll = beginRollPhase(gs);
        performRoll(inRoll);
        expect(inRoll.phase).toBe(GamePhase.ROLL);
    });

    it('throws when called outside ROLL phase', () => {
        expect(() => performRoll(gs)).toThrow();
    });
});

describe('confirmKeep', () => {
    it('marks player ready but stays in KEEP', () => {
        const inKeep = beginKeepPhase(gs);
        const result = confirmKeep(inKeep, 0);
        expect(result.phase).toBe(GamePhase.KEEP);
        expect(result.playersReady[0]).toBe(true);
        expect(result.playersReady[1]).toBe(false);
    });

    it('rerolls and decrements rollsLeft when both confirm with rollsLeft > 0', () => {
        const inKeep = beginKeepPhase(gs); // rollsLeft: 2
        const after0 = confirmKeep(inKeep, 0);
        const result = confirmKeep(after0, 1);
        expect(result.phase).toBe(GamePhase.KEEP);
        expect(result.rollsLeft).toBe(1);
        expect(result.playersReady).toEqual([false, false]);
    });

    it('transitions to ASSIGN when rollsLeft is 0 and both confirm', () => {
        const inKeep = { ...beginKeepPhase(gs), rollsLeft: 0 };
        const after0 = confirmKeep(inKeep, 0);
        const result = confirmKeep(after0, 1);
        expect(result.phase).toBe(GamePhase.ASSIGN);
        expect(result.playersReady).toEqual([false, false]);
    });

    it('skips rerolls and transitions to ASSIGN when all dice are locked', () => {
        const inKeep = lockAllPlayers(beginKeepPhase(gs)); // rollsLeft: 2 but all locked
        const after0 = confirmKeep(inKeep, 0);
        const result = confirmKeep(after0, 1);
        expect(result.phase).toBe(GamePhase.ASSIGN);
    });

    it('does not reroll locked dice', () => {
        const inKeep = beginKeepPhase(gs);
        // Lock slot 0 for player 0 only (not all 5, so no skip-to-ASSIGN)
        const withOneLock = {
            ...inKeep,
            players: [
                toggleDieLockForCharacter(inKeep.players[0], { playerIndex: 0, slot: 0 }),
                inKeep.players[1],
            ] as [Player, Player],
        };
        const lockedFace = withOneLock.players[0].team[0].face;
        const after0 = confirmKeep(withOneLock, 0);
        const result = confirmKeep(after0, 1);
        expect(result.players[0].team[0].face).toBe(lockedFace);
    });

    it('does not transition on first confirm alone', () => {
        const inKeep = { ...beginKeepPhase(gs), rollsLeft: 0 };
        const result = confirmKeep(inKeep, 0);
        expect(result.phase).toBe(GamePhase.KEEP);
    });

    it('throws when called outside KEEP phase', () => {
        expect(() => confirmKeep(gs, 0)).toThrow();
    });
});

describe('confirmAssignment', () => {
    it('marks player ready but stays in ASSIGN', () => {
        const inAssign = beginAssignPhase(gs);
        const result = confirmAssignment(inAssign, 0);
        expect(result.phase).toBe(GamePhase.ASSIGN);
        expect(result.playersReady[0]).toBe(true);
        expect(result.playersReady[1]).toBe(false);
    });

    it('transitions to RESOLVE and resets playersReady when both confirm', () => {
        const inAssign = beginAssignPhase(gs);
        const after0 = confirmAssignment(inAssign, 0);
        const result = confirmAssignment(after0, 1);
        expect(result.phase).toBe(GamePhase.RESOLVE);
        expect(result.playersReady).toEqual([false, false]);
    });

    it('throws when called outside ASSIGN phase', () => {
        expect(() => confirmAssignment(gs, 0)).toThrow();
    });
});

describe('performResolve', () => {
    it('transitions to RESULT phase', () => {
        const inResolve = { ...gs, phase: GamePhase.RESOLVE };
        const { state } = performResolve(inResolve);
        expect(state.phase).toBe(GamePhase.RESULT);
    });

    it('resets the priority queue after resolving', () => {
        const inResolve = { ...gs, phase: GamePhase.RESOLVE };
        const { state } = performResolve(inResolve);
        expect(state.priorityQueue.every(bucket => bucket.length === 0)).toBe(true);
    });

    it('returns a log array', () => {
        const inResolve = { ...gs, phase: GamePhase.RESOLVE };
        const { log } = performResolve(inResolve);
        expect(Array.isArray(log)).toBe(true);
    });

    it('throws when called outside RESOLVE phase', () => {
        expect(() => performResolve(gs)).toThrow();
    });
});

describe('cancelPlacement', () => {
    it('sets playersReady[i] to false when player was confirmed', () => {
        const confirmed = confirmPlacement(gs, 0);
        expect(confirmed.playersReady[0]).toBe(true);
        const result = cancelPlacement(confirmed, 0);
        expect(result.playersReady[0]).toBe(false);
        expect(result.phase).toBe(GamePhase.PLACEMENT);
    });

    it('returns the same reference when player was not confirmed', () => {
        const result = cancelPlacement(gs, 0);
        expect(result).toBe(gs);
    });

    it('throws when called outside PLACEMENT phase', () => {
        expect(() => cancelPlacement(beginRollPhase(gs), 0)).toThrow();
    });
});

describe('cancelKeep', () => {
    it('sets playersReady[i] to false when player was confirmed', () => {
        const inKeep = beginKeepPhase(gs);
        const confirmed = confirmKeep(inKeep, 0);
        expect(confirmed.playersReady[0]).toBe(true);
        const result = cancelKeep(confirmed, 0);
        expect(result.playersReady[0]).toBe(false);
        expect(result.phase).toBe(GamePhase.KEEP);
    });

    it('returns the same reference when player was not confirmed', () => {
        const inKeep = beginKeepPhase(gs);
        const result = cancelKeep(inKeep, 0);
        expect(result).toBe(inKeep);
    });

    it('throws when called outside KEEP phase', () => {
        expect(() => cancelKeep(gs, 0)).toThrow();
    });
});

describe('cancelAssignment', () => {
    it('sets playersReady[i] to false when player was confirmed', () => {
        const inAssign = beginAssignPhase(gs);
        const confirmed = confirmAssignment(inAssign, 0);
        expect(confirmed.playersReady[0]).toBe(true);
        const result = cancelAssignment(confirmed, 0);
        expect(result.playersReady[0]).toBe(false);
        expect(result.phase).toBe(GamePhase.ASSIGN);
    });

    it('returns the same reference when player was not confirmed', () => {
        const inAssign = beginAssignPhase(gs);
        const result = cancelAssignment(inAssign, 0);
        expect(result).toBe(inAssign);
    });

    it('throws when called outside ASSIGN phase', () => {
        expect(() => cancelAssignment(gs, 0)).toThrow();
    });
});
