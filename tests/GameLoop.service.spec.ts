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
    cancelPlacement, cancelKeep, createSelectionState, previewRound,
} from "@domain/services/GameLoop.service";
import { Player } from "@domain/types/Player.type";
import { unwrap, unwrapErr } from "./helpers/result";
import GameState from "@domain/types/GameState.type";
import { ResolveStep } from "@domain/types/PriorityQueue.type";
import { ScriptedDiceSource } from '@infrastructure/adapters/dice/ScriptedDiceSource';

const dice = ScriptedDiceSource.always(0);


const die = generateFullDie([
    { description: "A", priority: 1, effects: [{ targets: [enemyRel(0)], parts: [{ part: EffectLabel.Damage, magnitude: 1 }] }] },
    { description: "B", priority: 1, effects: [{ targets: [enemyRel(0)], parts: [{ part: EffectLabel.Damage, magnitude: 1 }] }] },
    { description: "C", priority: 1, effects: [{ targets: [enemyRel(0)], parts: [{ part: EffectLabel.Damage, magnitude: 1 }] }] },
    { description: "D", priority: 1, effects: [{ targets: [enemyRel(0)], parts: [{ part: EffectLabel.Damage, magnitude: 1 }] }] },
    { description: "E", priority: 1, effects: [{ targets: [enemyRel(0)], parts: [{ part: EffectLabel.Damage, magnitude: 1 }] }] },
    { description: "F", priority: 1, effects: [{ targets: [enemyRel(0)], parts: [{ part: EffectLabel.Damage, magnitude: 1 }] }] },
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

    it('PLACE-4: transitions to ROLL and resets playersReady when both confirm', () => {
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

describe('ROLL-1, ROLL-2: the first Roll rolls the dice that are not kept', () => {
    it('gives a new face to each die that is not kept, leaves a kept die alone, and remembers what was kept', () => {
        const lastFace = ScriptedDiceSource.always('last'); // the last face of every die
        const inRoll = beginRollPhase(gs);
        const keepFirst = (p: Player): Player => ({ ...p, team: p.team.map((c, i) => i === 0 ? { ...c, isFaceLocked: true } : c) });
        const rolled = unwrap(performRoll({ ...inRoll, players: [keepFirst(inRoll.players[0]), keepFirst(inRoll.players[1])] }, lastFace));

        for (const player of rolled.players) {
            expect(player.team[0].face.description).toBe('A');
            expect(player.team[0].keptAtLastRoll).toBe(true);
            expect(player.team.slice(1).map(c => c.face.description)).toEqual(['F', 'F', 'F', 'F']);
            expect(player.team.slice(1).every(c => !c.keptAtLastRoll)).toBe(true);
        }
    });
});

describe('performRoll', () => {
    it('transitions to KEEP and resets playersReady', () => {
        const inRoll = beginRollPhase(gs);
        const result = unwrap(performRoll(inRoll, dice));
        expect(result.phase).toBe(GamePhase.KEEP);
        expect(result.playersReady).toEqual([false, false]);
    });


    it('does not mutate the original state', () => {
        const inRoll = beginRollPhase(gs);
        performRoll(inRoll, dice);
        expect(inRoll.phase).toBe(GamePhase.ROLL);
    });

    it('returns a WRONG_PHASE error when called outside ROLL phase', () => {
        expect(unwrapErr(performRoll(gs, dice)).code).toBe('WRONG_PHASE');
    });
});

describe('confirmKeep', () => {
    it('marks player ready but stays in KEEP', () => {
        const inKeep = beginKeepPhase(gs);
        const result = unwrap(confirmKeep(inKeep, 0, dice));
        expect(result.phase).toBe(GamePhase.KEEP);
        expect(result.playersReady[0]).toBe(true);
        expect(result.playersReady[1]).toBe(false);
    });

    it('rerolls and decrements rollsLeft when both confirm with rollsLeft > 0', () => {
        const inKeep = beginKeepPhase(gs); // rollsLeft: 2
        const after0 = unwrap(confirmKeep(inKeep, 0, dice));
        const result = unwrap(confirmKeep(after0, 1, dice));
        expect(result.phase).toBe(GamePhase.KEEP);
        expect(result.rollsLeft).toBe(1);
        expect(result.playersReady).toEqual([false, false]);
    });

    it('ROLL-4: transitions straight to RESOLVE when the final reroll exhausts rollsLeft (no dead keep round)', () => {
        const inKeep = { ...beginKeepPhase(gs), rollsLeft: 1 };
        const after0 = unwrap(confirmKeep(inKeep, 0, dice));
        const result = unwrap(confirmKeep(after0, 1, dice));
        expect(result.phase).toBe(GamePhase.RESOLVE);
        expect(result.rollsLeft).toBe(0);
        expect(result.playersReady).toEqual([false, false]);
    });

    it('ROLL-4: still rerolls when only one player has locked every die', () => {
        const kept = beginKeepPhase(gs);
        const p0Locked = { ...kept, players: [lockAllPlayers(kept).players[0], kept.players[1]] as typeof kept.players };
        const result = unwrap(confirmKeep(unwrap(confirmKeep(p0Locked, 0, dice)), 1, dice));
        expect(result.phase).toBe(GamePhase.KEEP);
        expect(result.rollsLeft).toBe(1);
    });

    it('GAME-5, ROLL-4: with every die kept, both Keeps still lead to another Roll, and Resolve only follows the third Roll', () => {
        const inKeep = lockAllPlayers(beginKeepPhase(gs)); // first Roll done, rollsLeft: 2, every die kept
        const afterFirstKeep = unwrap(confirmKeep(unwrap(confirmKeep(inKeep, 0, dice)), 1, dice));
        expect(afterFirstKeep.phase).toBe(GamePhase.KEEP);
        expect(afterFirstKeep.rollsLeft).toBe(1);
        expect(afterFirstKeep.players.map(p => p.team.map(c => c.face)))
            .toEqual(inKeep.players.map(p => p.team.map(c => c.face)));
        const afterSecondKeep = unwrap(confirmKeep(unwrap(confirmKeep(afterFirstKeep, 0, dice)), 1, dice));
        expect(afterSecondKeep.phase).toBe(GamePhase.RESOLVE);
    });

    it('ROLL-1: does not reroll locked dice', () => {
        const inKeep = beginKeepPhase(gs);
        // Lock slot 0 for player 0 only 
        const withOneLock = {
            ...inKeep,
            players: [
                { ...inKeep.players[0], team: inKeep.players[0].team.map((c, i) => i === 0 ? { ...c, isFaceLocked: true } : c) },
                inKeep.players[1],
            ] as [Player, Player],
        };
        const lockedFace = withOneLock.players[0].team[0].face;
        // Every reroll lands on the last face, never the current one: a reroll of the locked die would show.
        const lastFace = ScriptedDiceSource.always('last');
        const after0 = unwrap(confirmKeep(withOneLock, 0, lastFace));
        const result = unwrap(confirmKeep(after0, 1, lastFace));
        expect(result.players[0].team[1].face).toBe(result.players[0].team[1].baseDie[5]);
        expect(result.players[0].team[0].face).toBe(lockedFace);
    });

    it('does not transition on first confirm alone', () => {
        const inKeep = { ...beginKeepPhase(gs), rollsLeft: 1 };
        const result = unwrap(confirmKeep(inKeep, 0, dice));
        expect(result.phase).toBe(GamePhase.KEEP);
    });

    it('returns a WRONG_PHASE error when called outside KEEP phase', () => {
        expect(unwrapErr(confirmKeep(gs, 0, dice)).code).toBe('WRONG_PHASE');
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

    it('returns a WRONG_PHASE error when called outside RESOLVE phase', () => {
        expect(unwrapErr(performResolve(gs)).code).toBe('WRONG_PHASE');
    });
});

describe('previewRound', () => {
    it('UX-1: gives the log performResolve would give from the same faces, without touching the state', () => {
        const inKeep = beginKeepPhase(gs);
        const before = structuredClone(inKeep);
        const { log } = unwrap(performResolve({ ...inKeep, phase: GamePhase.RESOLVE }));
        const preview = unwrap(previewRound(inKeep));
        expect(preview.length).toBeGreaterThan(0);
        expect(preview).toEqual(log);
        expect(inKeep).toEqual(before);
    });

    it('END-1, RES-2: lists every character on the board when the round would end the match', () => {
        // Player 1 already lost a character, and the one in slot 0 dies to the first hit it takes.
        const [frail, ...rest] = gs.players[1].team;
        const gone = createCharacter({ catalogId: TEST_CATALOG_ID, name: "Gone", maxHp: 100, baseSpeed: 1, baseDie: die, position: { playerIndex: 1, slot: 4 } });
        const lastStand: Player = { ...gs.players[1], team: [{ ...frail, hp: 1 }, ...rest], fallen: [{ ...gone, hp: 0 }] };
        const inKeep = beginKeepPhase({ ...gs, players: [gs.players[0], lastStand] });

        const preview = unwrap(previewRound(inKeep));
        const { state, log } = unwrap(performResolve({ ...inKeep, phase: GamePhase.RESOLVE }));

        expect(state.winner).toBe(0);
        expect(preview).toEqual(log);
        expect(preview).toHaveLength(10);
        expect(new Set(preview.map(s => s.characterId)).size).toBe(10);
        expect(preview.some(s => s.unplayed)).toBe(true);
    });

    it('returns a WRONG_PHASE error when called outside KEEP phase', () => {
        expect(unwrapErr(previewRound(beginRollPhase(gs))).code).toBe('WRONG_PHASE');
    });

    it('FLOW-3: ignores locks: kept dice give the same preview as free ones', () => {
        // The snapshots in the log carry each character as it is, lock flag included; only that flag may differ.
        const unlocked = (log: readonly ResolveStep[]) => log.map(step => ({
            ...step,
            changes: step.changes.map(c => ({ ...c, character: { ...c.character, isFaceLocked: false } })),
        }));
        const inKeep = beginKeepPhase(gs);
        expect(unlocked(unwrap(previewRound(lockAllPlayers(inKeep))))).toEqual(unlocked(unwrap(previewRound(inKeep))));
    });
});

describe('GAME-8: cancelPlacement', () => {
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

describe('GAME-8: cancelKeep', () => {
    it('sets playersReady[i] to false when player was confirmed', () => {
        const inKeep = beginKeepPhase(gs);
        const confirmed = unwrap(confirmKeep(inKeep, 0, dice));
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


describe('SEL-1, PRIO-3: initiative at game init', () => {
    it('gives the initiative to player 0 when the draw falls on the lower half', () => {
        const draw = new ScriptedDiceSource([0]);
        expect(createSelectionState([[], []], 0, draw).initiativePlayerIndex).toBe(0);
        expect(draw.sizes).toEqual([2]);
    });

    it('gives the initiative to player 1 when the draw falls on the upper half', () => {
        expect(createSelectionState([[], []], 0, new ScriptedDiceSource([1])).initiativePlayerIndex).toBe(1);
    });
});
