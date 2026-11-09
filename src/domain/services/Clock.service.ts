import GameState, { PlayerClock } from "../types/GameState.type";
import GamePhase from "../types/GamePhase.type";
import { PlayerIndex } from "../types/Position.type";

/** CLOCK-1: thinking time of each player for the match. */
export const INITIAL_CLOCK_MS = 10 * 60_000;
/** CLOCK-1: time a player may spend disconnected over the whole match. */
export const RECONNECTION_MS = 3 * 60_000;
/** CLOCK-1, KEEP-4: time both players gain at the end of each Keep. */
export const INCREMENT_MS = 10_000;

const CLOCK_PHASES: readonly GamePhase[] = [GamePhase.SELECTION, GamePhase.PLACEMENT, GamePhase.KEEP];

export function createClocks(): [PlayerClock, PlayerClock] {
    const fresh = (): PlayerClock => ({ remainingMs: INITIAL_CLOCK_MS, reconnectionMs: RECONNECTION_MS, connected: true });
    return [fresh(), fresh()];
}

/** CLOCK-2: a clock runs in the phases where the player acts, and pauses while they have confirmed. */
export function isClockRunning(gs: GameState, playerIndex: PlayerIndex): boolean {
    return gs.winner === undefined && CLOCK_PHASES.includes(gs.phase) && !gs.playersReady[playerIndex];
}

function withClocks(gs: GameState, clocks: [PlayerClock, PlayerClock]): GameState {
    return { ...gs, clocks };
}

/**
 * Charges the time since the last settling to what ran during it (the clocks that run, the
 * reconnection time of whoever is disconnected: AWAY-2), then stamps `now`. Call it before any
 * change of state, so the interval is charged with the state that held during it.
 */
export function settleClocks(gs: GameState, now: number): GameState {
    const elapsed = now - gs.clockUpdatedAt;
    if (elapsed <= 0) return gs;
    const clocks = gs.clocks.map((clock, i) => ({
        ...clock,
        remainingMs: isClockRunning(gs, i as PlayerIndex) ? Math.max(0, clock.remainingMs - elapsed) : clock.remainingMs,
        reconnectionMs: clock.connected ? clock.reconnectionMs : Math.max(0, clock.reconnectionMs - elapsed),
    })) as [PlayerClock, PlayerClock];
    return { ...withClocks(gs, clocks), clockUpdatedAt: now };
}

export function setConnected(gs: GameState, playerIndex: PlayerIndex, connected: boolean, now: number): GameState {
    const settled = settleClocks(gs, now);
    const clocks = [...settled.clocks] as [PlayerClock, PlayerClock];
    clocks[playerIndex] = { ...clocks[playerIndex], connected };
    return withClocks(settled, clocks);
}

/** KEEP-4: each player gains the increment when both have confirmed a Keep. */
export function addIncrement(gs: GameState): GameState {
    const clocks = gs.clocks.map(clock => ({ ...clock, remainingMs: clock.remainingMs + INCREMENT_MS })) as [PlayerClock, PlayerClock];
    return withClocks(gs, clocks);
}

export type Expiry = {
    readonly at: number;
    readonly loser: PlayerIndex;
    readonly reason: 'clock' | 'reconnection';
};

/** The first moment a clock or a reconnection time reaches 0, if the state holds until then. */
export function nextExpiry(gs: GameState): Expiry | null {
    if (gs.winner !== undefined) return null;
    const candidates: Expiry[] = [];
    gs.clocks.forEach((clock, i) => {
        const loser = i as PlayerIndex;
        if (isClockRunning(gs, loser)) candidates.push({ at: gs.clockUpdatedAt + clock.remainingMs, loser, reason: 'clock' });
        if (!clock.connected) candidates.push({ at: gs.clockUpdatedAt + clock.reconnectionMs, loser, reason: 'reconnection' });
    });
    // Same moment: player 0 comes first in the list, and the sort is stable.
    return candidates.sort((a, b) => a.at - b.at)[0] ?? null;
}

/** CLOCK-3, AWAY-3: the player whose clock or reconnection time has reached 0 by `now` loses at once. */
export function expireClocks(gs: GameState, now: number): GameState {
    const expiry = nextExpiry(gs);
    if (!expiry || expiry.at > now) return gs;
    const settled = settleClocks(gs, expiry.at);
    return { ...settled, winner: (1 - expiry.loser) as PlayerIndex, endReason: expiry.reason };
}
