import { TEST_CATALOG_ID } from './helpers/catalog';
import EffectLabel from "@domain/types/EffectLabels.type";
import { enemyRel } from "./helpers/targets";
import { SlotIndex } from "@domain/types/Position.type";
import GamePhase from "@domain/types/GamePhase.type";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "./helpers/gameState";
import { createPlayer } from "@domain/services/Player.service";
import { beginKeepPhase, beginRollPhase } from "@domain/services/Phase.service";
import {
    confirmPlacement, performRoll, confirmKeep, performResolve,
    cancelPlacement, cancelKeep, createSelectionState,
} from "@domain/services/GameLoop.service";
import { Player } from "@domain/types/Player.type";
import { unwrap, unwrapErr } from "./helpers/result";
import GameState from "@domain/types/GameState.type";


const die = generateFullDie([
    { description: "A", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "B", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "C", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "E", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "F", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
] satisfies BaseDieInstructions);

const makeTeam = (pi: 0 | 1) =>
    createPlayer([0, 1, 2, 3, 4].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: "C", maxHp: 100, baseSpeed: 1, baseDie: die, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);

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
        const result = unwrap(confirmPlacement(gs, 0));
        expect(result.phase).toBe(GamePhase.PLACEMENT);
        expect(result.playersReady[0]).toBe(true);
        expect(result.playersReady[1]).toBe(false);
    });

    it('marks player 1 ready but stays in PLACEMENT', () => {
        const result = unwrap(confirmPlacement(gs, 1));
        expect(result.phase).toBe(GamePhase.PLACEMENT);
        expect(result.playersReady[1]).toBe(true);
        expect(result.playersReady[0]).toBe(false);
    });

    it('transitions to ROLL and resets playersReady when both confirm', () => {
        const after0 = unwrap(confirmPlacement(gs, 0));
        const result = unwrap(confirmPlacement(after0, 1));
        expect(result.phase).toBe(GamePhase.ROLL);
        expect(result.playersReady).toEqual([false, false]);
    });

    it('returns a WRONG_PHASE error when called outside PLACEMENT phase', () => {
        expect(unwrapErr(confirmPlacement(beginRollPhase(gs), 0)).code).toBe('WRONG_PHASE');
    });

    it('returns an ALREADY_CONFIRMED error when the player already confirmed', () => {
        const after0 = unwrap(confirmPlacement(gs, 0));
        expect(unwrapErr(confirmPlacement(after0, 0)).code).toBe('ALREADY_CONFIRMED');
    });
});

describe('performRoll', () => {
    it('transitions to KEEP and resets playersReady', () => {
        const inRoll = beginRollPhase(gs);
        const result = unwrap(performRoll(inRoll));
        expect(result.phase).toBe(GamePhase.KEEP);
        expect(result.playersReady).toEqual([false, false]);
    });


    it('does not mutate the original state', () => {
        const inRoll = beginRollPhase(gs);
        performRoll(inRoll);
        expect(inRoll.phase).toBe(GamePhase.ROLL);
    });

    it('returns a WRONG_PHASE error when called outside ROLL phase', () => {
        expect(unwrapErr(performRoll(gs)).code).toBe('WRONG_PHASE');
    });
});

describe('confirmKeep', () => {
    it('marks player ready but stays in KEEP', () => {
        const inKeep = beginKeepPhase(gs);
        const result = unwrap(confirmKeep(inKeep, 0));
        expect(result.phase).toBe(GamePhase.KEEP);
        expect(result.playersReady[0]).toBe(true);
        expect(result.playersReady[1]).toBe(false);
    });

    it('rerolls and decrements rollsLeft when both confirm with rollsLeft > 0', () => {
        const inKeep = beginKeepPhase(gs); // rollsLeft: 2
        const after0 = unwrap(confirmKeep(inKeep, 0));
        const result = unwrap(confirmKeep(after0, 1));
        expect(result.phase).toBe(GamePhase.KEEP);
        expect(result.rollsLeft).toBe(1);
        expect(result.playersReady).toEqual([false, false]);
    });

    it('transitions to RESOLVE when rollsLeft is 0 and both confirm', () => {
        const inKeep = { ...beginKeepPhase(gs), rollsLeft: 0 };
        const after0 = unwrap(confirmKeep(inKeep, 0));
        const result = unwrap(confirmKeep(after0, 1));
        expect(result.phase).toBe(GamePhase.RESOLVE);
        expect(result.playersReady).toEqual([false, false]);
    });

    it('transitions straight to RESOLVE when the final reroll exhausts rollsLeft (no dead keep round)', () => {
        const inKeep = { ...beginKeepPhase(gs), rollsLeft: 1 };
        const after0 = unwrap(confirmKeep(inKeep, 0));
        const result = unwrap(confirmKeep(after0, 1));
        expect(result.phase).toBe(GamePhase.RESOLVE);
        expect(result.rollsLeft).toBe(0);
        expect(result.playersReady).toEqual([false, false]);
    });

    it('skips rerolls and transitions to RESOLVE when all dice are locked', () => {
        const inKeep = lockAllPlayers(beginKeepPhase(gs)); // rollsLeft: 2 but all locked
        const after0 = unwrap(confirmKeep(inKeep, 0));
        const result = unwrap(confirmKeep(after0, 1));
        expect(result.phase).toBe(GamePhase.RESOLVE);
    });

    it('does not reroll locked dice', () => {
        const inKeep = beginKeepPhase(gs);
        // Lock slot 0 for player 0 only (not all 5, so no skip-to-RESOLVE)
        const withOneLock = {
            ...inKeep,
            players: [
                { ...inKeep.players[0], team: inKeep.players[0].team.map((c, i) => i === 0 ? { ...c, isFaceLocked: true } : c) },
                inKeep.players[1],
            ] as [Player, Player],
        };
        const lockedFace = withOneLock.players[0].team[0].face;
        const after0 = unwrap(confirmKeep(withOneLock, 0));
        const result = unwrap(confirmKeep(after0, 1));
        expect(result.players[0].team[0].face).toBe(lockedFace);
    });

    it('does not transition on first confirm alone', () => {
        const inKeep = { ...beginKeepPhase(gs), rollsLeft: 0 };
        const result = unwrap(confirmKeep(inKeep, 0));
        expect(result.phase).toBe(GamePhase.KEEP);
    });

    it('returns a WRONG_PHASE error when called outside KEEP phase', () => {
        expect(unwrapErr(confirmKeep(gs, 0)).code).toBe('WRONG_PHASE');
    });
});

describe('performResolve', () => {
    it('transitions to RESULT phase', () => {
        const inResolve = { ...gs, phase: GamePhase.RESOLVE };
        const { state } = unwrap(performResolve(inResolve));
        expect(state.phase).toBe(GamePhase.RESULT);
    });

    it('resets the priority queue after resolving', () => {
        const inResolve = { ...gs, phase: GamePhase.RESOLVE };
        const { state } = unwrap(performResolve(inResolve));
        expect(state.priorityQueue.length).toBe(0);
    });

    it('returns a log array', () => {
        const inResolve = { ...gs, phase: GamePhase.RESOLVE };
        const { log } = unwrap(performResolve(inResolve));
        expect(Array.isArray(log)).toBe(true);
    });

    it('returns a WRONG_PHASE error when called outside RESOLVE phase', () => {
        expect(unwrapErr(performResolve(gs)).code).toBe('WRONG_PHASE');
    });
});

describe('cancelPlacement', () => {
    it('sets playersReady[i] to false when player was confirmed', () => {
        const confirmed = unwrap(confirmPlacement(gs, 0));
        expect(confirmed.playersReady[0]).toBe(true);
        const result = unwrap(cancelPlacement(confirmed, 0));
        expect(result.playersReady[0]).toBe(false);
        expect(result.phase).toBe(GamePhase.PLACEMENT);
    });

    it('returns the same reference when player was not confirmed', () => {
        const result = unwrap(cancelPlacement(gs, 0));
        expect(result).toBe(gs);
    });

    it('returns a WRONG_PHASE error when called outside PLACEMENT phase', () => {
        expect(unwrapErr(cancelPlacement(beginRollPhase(gs), 0)).code).toBe('WRONG_PHASE');
    });
});

describe('cancelKeep', () => {
    it('sets playersReady[i] to false when player was confirmed', () => {
        const inKeep = beginKeepPhase(gs);
        const confirmed = unwrap(confirmKeep(inKeep, 0));
        expect(confirmed.playersReady[0]).toBe(true);
        const result = unwrap(cancelKeep(confirmed, 0));
        expect(result.playersReady[0]).toBe(false);
        expect(result.phase).toBe(GamePhase.KEEP);
    });

    it('returns the same reference when player was not confirmed', () => {
        const inKeep = beginKeepPhase(gs);
        const result = unwrap(cancelKeep(inKeep, 0));
        expect(result).toBe(inKeep);
    });

    it('returns a WRONG_PHASE error when called outside KEEP phase', () => {
        expect(unwrapErr(cancelKeep(gs, 0)).code).toBe('WRONG_PHASE');
    });
});


describe('initiative at game init', () => {
    afterEach(() => jest.restoreAllMocks());

    it('gives the initiative to player 0 when the draw falls on the lower half', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.2);
        expect(createSelectionState([[], []]).initiativePlayerIndex).toBe(0);
    });

    it('gives the initiative to player 1 when the draw falls on the upper half', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.7);
        expect(createSelectionState([[], []]).initiativePlayerIndex).toBe(1);
    });
});
