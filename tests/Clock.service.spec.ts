import { createGameState } from './helpers/gameState';
import { createPlayer } from '@domain/services/Player.service';
import { createSelectionState } from '@domain/services/GameLoop.service';
import {
    createClocks, isClockRunning, settleClocks, setConnected, nextExpiry, expireClocks, addIncrement,
    INITIAL_CLOCK_MS, RECONNECTION_MS, INCREMENT_MS,
} from '@domain/services/Clock.service';
import { confirmKeep, confirmPlacement } from '@domain/services/GameLoop.service';
import { unwrap } from './helpers/result';
import GamePhase from '@domain/types/GamePhase.type';
import GameState from '@domain/types/GameState.type';
import { PlayerIndex } from '@domain/types/Position.type';

const T0 = 1_000_000;
const SECOND = 1000;

/** A match whose clocks were last settled at T0, in the given phase. */
const at = (phase: GamePhase, ready: [boolean, boolean] = [false, false]): GameState => ({
    ...createGameState(createPlayer([], 0), createPlayer([], 1)),
    phase,
    playersReady: ready,
    clocks: createClocks(),
    clockUpdatedAt: T0,
});

describe('CLOCK-1: the clocks', () => {
    it('start at 10 minutes of thinking time and 3 minutes of reconnection time, both players connected', () => {
        expect(INITIAL_CLOCK_MS).toBe(10 * 60 * SECOND);
        expect(RECONNECTION_MS).toBe(3 * 60 * SECOND);
        expect(createClocks()).toEqual([
            { remainingMs: 600_000, reconnectionMs: 180_000, connected: true, publishedMs: 600_000 },
            { remainingMs: 600_000, reconnectionMs: 180_000, connected: true, publishedMs: 600_000 },
        ]);
    });
});

describe('SEL-1: the clocks start with the match', () => {
    it('are created, stamped with the start, when Selection opens', () => {
        const gs = createSelectionState([[], []], T0);
        expect(gs.clocks).toEqual(createClocks());
        expect(gs.clockUpdatedAt).toBe(T0);
    });
});

describe('CLOCK-2: a clock runs in the phases where the player acts, and pauses when they confirm', () => {
    it.each([GamePhase.SELECTION, GamePhase.PLACEMENT, GamePhase.KEEP])('runs in %s', (phase) => {
        expect(isClockRunning(at(phase), 0)).toBe(true);
        expect(isClockRunning(at(phase), 1)).toBe(true);
    });

    it.each([GamePhase.ROLL, GamePhase.RESOLVE, GamePhase.RESULT])('is stopped in %s', (phase) => {
        expect(isClockRunning(at(phase), 0)).toBe(false);
    });

    it('pauses for the player who confirmed and runs for the other', () => {
        const gs = at(GamePhase.KEEP, [true, false]);
        expect(isClockRunning(gs, 0)).toBe(false);
        expect(isClockRunning(gs, 1)).toBe(true);
    });

    it('runs again if the player cancels', () => {
        expect(isClockRunning({ ...at(GamePhase.KEEP, [true, false]), playersReady: [false, false] }, 0)).toBe(true);
    });

    it('is stopped once the match is decided', () => {
        expect(isClockRunning({ ...at(GamePhase.KEEP), winner: 0 }, 1)).toBe(false);
    });

    it('charges the time since the last settling to the clocks that run, and stamps the new time', () => {
        const settled = settleClocks(at(GamePhase.KEEP, [true, false]), T0 + 5 * SECOND);
        expect(settled.clocks[0].remainingMs).toBe(600_000);
        expect(settled.clocks[1].remainingMs).toBe(595_000);
        expect(settled.clockUpdatedAt).toBe(T0 + 5 * SECOND);
    });

    it('charges nothing in a phase where the clocks are stopped', () => {
        const settled = settleClocks(at(GamePhase.RESOLVE), T0 + 30 * SECOND);
        expect(settled.clocks).toEqual(createClocks());
    });

    it('never goes below 0', () => {
        const settled = settleClocks(at(GamePhase.KEEP), T0 + 20 * 60 * SECOND);
        expect(settled.clocks[0].remainingMs).toBe(0);
    });

    it('does not go back in time', () => {
        const settled = settleClocks(at(GamePhase.KEEP), T0 - SECOND);
        expect(settled.clocks).toEqual(createClocks());
    });
});

describe('AWAY-2: reconnection time runs while a player is disconnected, and is never refilled', () => {
    it('runs together with the clock when it runs', () => {
        const gs = setConnected(at(GamePhase.KEEP), 0, false, T0);
        const settled = settleClocks(gs, T0 + 7 * SECOND);
        expect(settled.clocks[0]).toEqual({ remainingMs: 593_000, reconnectionMs: 173_000, connected: false, publishedMs: 600_000 });
        expect(settled.clocks[1].reconnectionMs).toBe(180_000);
    });

    it('runs alone when the clock is paused or stopped', () => {
        const gs = setConnected(at(GamePhase.KEEP, [true, false]), 0, false, T0);
        const settled = settleClocks(gs, T0 + 7 * SECOND);
        expect(settled.clocks[0]).toEqual({ remainingMs: 600_000, reconnectionMs: 173_000, connected: false, publishedMs: 600_000 });
        expect(settleClocks(setConnected(at(GamePhase.RESOLVE), 1, false, T0), T0 + 7 * SECOND).clocks[1].reconnectionMs).toBe(173_000);
    });

    it('stops when the player is back, and is not refilled', () => {
        let gs = setConnected(at(GamePhase.ROLL), 0, false, T0);
        gs = setConnected(gs, 0, true, T0 + 10 * SECOND);
        gs = settleClocks(gs, T0 + 60 * SECOND);
        expect(gs.clocks[0]).toEqual({ remainingMs: 600_000, reconnectionMs: 170_000, connected: true, publishedMs: 600_000 });
        gs = setConnected(gs, 0, false, T0 + 60 * SECOND);
        expect(settleClocks(gs, T0 + 70 * SECOND).clocks[0].reconnectionMs).toBe(160_000);
    });

    it('charges the interval that ends with the change to what held during it', () => {
        const away = setConnected(at(GamePhase.ROLL), 0, false, T0);
        const back = setConnected(away, 0, true, T0 + 4 * SECOND);
        expect(back.clocks[0].reconnectionMs).toBe(176_000);
        expect(back.clockUpdatedAt).toBe(T0 + 4 * SECOND);
    });
});

describe('CLOCK-3, AWAY-3: a player whose clock or reconnection time reaches 0 loses at once', () => {
    it('has no expiry while nothing runs', () => {
        expect(nextExpiry(at(GamePhase.ROLL))).toBeNull();
    });

    it('gives the moment the first clock reaches 0, with its player', () => {
        const gs = { ...at(GamePhase.KEEP), clocks: [{ ...createClocks()[0], remainingMs: 9000 }, { ...createClocks()[1], remainingMs: 4000 }] as GameState['clocks'] };
        expect(nextExpiry(gs)).toEqual({ at: T0 + 4000, loser: 1, reason: 'clock' });
    });

    it('does not count a paused clock', () => {
        const gs = at(GamePhase.KEEP, [true, false]);
        expect(nextExpiry(gs)).toEqual({ at: T0 + 600_000, loser: 1, reason: 'clock' });
    });

    it('gives the reconnection time of a disconnected player when it ends first', () => {
        const gs = setConnected(at(GamePhase.ROLL), 1, false, T0);
        expect(nextExpiry(gs)).toEqual({ at: T0 + 180_000, loser: 1, reason: 'reconnection' });
    });

    it('END-1: both clocks reaching 0 at the same moment make both players lose', () => {
        expect(nextExpiry(at(GamePhase.KEEP))).toEqual({ at: T0 + 600_000, loser: 'both', reason: 'clock' });
    });

    it('has no expiry once the match is decided, even for a player who is away', () => {
        expect(nextExpiry({ ...at(GamePhase.KEEP), winner: 0 })).toBeNull();
        expect(nextExpiry({ ...setConnected(at(GamePhase.KEEP), 1, false, T0), winner: 0 })).toBeNull();
    });

    it.each([0, 1] as const)('the opponent of player %i wins when their clock reaches 0, and the clock reads 0 then', (loser) => {
        const [c0, c1] = createClocks();
        const clocks: GameState['clocks'] = loser === 0 ? [{ ...c0, remainingMs: 3000 }, c1] : [c0, { ...c1, remainingMs: 3000 }];
        const ended = expireClocks({ ...at(GamePhase.KEEP), clocks }, T0 + 10 * SECOND);
        expect(ended.winner).toBe(1 - loser);
        expect(ended.endReason).toBe('clock');
        expect(ended.clocks[loser].remainingMs).toBe(0);
        expect(ended.clockUpdatedAt).toBe(T0 + 3000);
    });

    it('the opponent wins when a reconnection time runs out', () => {
        const away = setConnected(at(GamePhase.ROLL), 0, false, T0);
        const ended = expireClocks(away, T0 + 181 * SECOND);
        expect(ended.winner).toBe(1);
        expect(ended.endReason).toBe('reconnection');
    });

    it('decides nothing before the moment', () => {
        const gs = at(GamePhase.KEEP);
        expect(expireClocks(gs, T0 + 599 * SECOND)).toBe(gs);
    });

    it('decides at the very moment', () => {
        // Player 0 has confirmed: only player 1's clock runs out.
        expect(expireClocks(at(GamePhase.KEEP, [true, false]), T0 + 600_000).winner).toBe(0);
    });

    it('does not change a decided match', () => {
        const decided = { ...at(GamePhase.KEEP), winner: 0 as PlayerIndex, endReason: 'elimination' as const };
        expect(expireClocks(decided, T0 + 20 * 60 * SECOND)).toBe(decided);
    });
});

describe('CLOCK-4, GAME-7: a clock is published to the opponent at the end of each decision phase, never during', () => {
    const published = (gs: GameState) => gs.clocks.map(c => c.publishedMs);
    const running = (phase: GamePhase, remaining: [number, number]): GameState => {
        const [c0, c1] = createClocks();
        return { ...at(phase), clocks: [{ ...c0, remainingMs: remaining[0] }, { ...c1, remainingMs: remaining[1] }] };
    };

    it('starts equal to the thinking time', () => {
        expect(published(at(GamePhase.SELECTION))).toEqual([600_000, 600_000]);
    });

    it('does not follow the clock while players decide, even when settled', () => {
        const settled = settleClocks(at(GamePhase.KEEP), T0 + 30 * SECOND);
        expect(settled.clocks.map(c => c.remainingMs)).toEqual([570_000, 570_000]);
        expect(published(settled)).toEqual([600_000, 600_000]);
    });

    it('does not change when only one player has confirmed', () => {
        const first = unwrap(confirmKeep(running(GamePhase.KEEP, [500_000, 480_000]), 0));
        expect(published(first)).toEqual([600_000, 600_000]);
    });

    it('is updated when both have confirmed a Keep, increment included', () => {
        const first = unwrap(confirmKeep(running(GamePhase.KEEP, [500_000, 480_000]), 0));
        const second = unwrap(confirmKeep(first, 1));
        expect(published(second)).toEqual([510_000, 490_000]);
    });

    it('is updated when both have confirmed the Placement', () => {
        const first = unwrap(confirmPlacement(running(GamePhase.PLACEMENT, [550_000, 540_000]), 0));
        expect(published(first)).toEqual([600_000, 600_000]);
        expect(published(unwrap(confirmPlacement(first, 1)))).toEqual([550_000, 540_000]);
    });
});

describe('KEEP-4: each player gains the increment when both have confirmed a Keep', () => {
    const keepWith = (ready: [boolean, boolean], rollsLeft: number): GameState => ({ ...at(GamePhase.KEEP, ready), rollsLeft });

    it('adds 10 seconds to both clocks', () => {
        expect(INCREMENT_MS).toBe(10_000);
        const gs = addIncrement(at(GamePhase.KEEP));
        expect(gs.clocks.map(c => c.remainingMs)).toEqual([610_000, 610_000]);
    });

    it('is granted by confirmKeep when the second player confirms, whether a Roll or Resolve follows', () => {
        for (const rollsLeft of [2, 1, 0]) {
            const first = unwrap(confirmKeep(keepWith([false, false], rollsLeft), 0));
            expect(first.clocks.map(c => c.remainingMs)).toEqual([600_000, 600_000]);
            const second = unwrap(confirmKeep(first, 1));
            expect(second.clocks.map(c => c.remainingMs)).toEqual([610_000, 610_000]);
        }
    });

    it('does not touch the reconnection time', () => {
        expect(addIncrement(at(GamePhase.KEEP)).clocks.map(c => c.reconnectionMs)).toEqual([180_000, 180_000]);
    });
});

describe('END-1, END-3: a simultaneous loss on time is a draw', () => {
    const drawOf = (gs: GameState, now: number) => expireClocks(gs, now);

    it('both clocks run out at the same instant: nobody wins, the match says clock', () => {
        const ended = drawOf(at(GamePhase.KEEP), T0 + 600_000);
        expect(ended.winner).toBe('draw');
        expect(ended.endReason).toBe('clock');
        expect(ended.clocks.map(c => c.remainingMs)).toEqual([0, 0]);
    });

    it('both reconnection times run out at the same instant: a draw, by reconnection time', () => {
        const away = setConnected(setConnected(at(GamePhase.ROLL), 0, false, T0), 1, false, T0);
        const ended = drawOf(away, T0 + 180_000);
        expect(ended.winner).toBe('draw');
        expect(ended.endReason).toBe('reconnection');
    });

    it('one player runs out of clock when the other runs out of reconnection time: a draw', () => {
        const [c0, c1] = createClocks();
        const base: GameState = { ...at(GamePhase.KEEP, [false, true]), clocks: [{ ...c0, remainingMs: 180_000 }, c1] };
        const ended = drawOf(setConnected(base, 1, false, T0), T0 + 180_000);
        expect(ended.winner).toBe('draw');
        expect(ended.endReason).toBe('clock');
    });

    it('is not a draw when one runs out a moment before the other', () => {
        const [c0, c1] = createClocks();
        const gs: GameState = { ...at(GamePhase.KEEP), clocks: [{ ...c0, remainingMs: 1000 }, { ...c1, remainingMs: 1001 }] };
        expect(drawOf(gs, T0 + 5 * SECOND).winner).toBe(1);
    });

    it('END-3: a player whose clock and reconnection time run out at the same instant loses on clock', () => {
        const [c0, c1] = createClocks();
        const base: GameState = { ...at(GamePhase.KEEP), clocks: [{ ...c0, remainingMs: 180_000 }, { ...c1, remainingMs: 590_000 }] };
        const away = setConnected(base, 0, false, T0);

        expect(nextExpiry(away)).toEqual({ at: T0 + 180_000, loser: 0, reason: 'clock' });
        const ended = drawOf(away, T0 + 180_000);
        expect(ended.winner).toBe(1);
        expect(ended.endReason).toBe('clock');
    });
});
