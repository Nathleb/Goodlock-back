import { evaluateClaim, computeAfkClaimInMs, computeForfeitClaimInMs } from '@domain/services/Claim.service';
import { ClaimConfig } from '@domain/types/Claim.type';
import { PlayerPresence } from '@domain/types/Presence.type';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import { Player } from '@domain/types/Player.type';

const CONFIG: ClaimConfig = { graceMs: 60_000, afkLimitMs: 120_000 };
const NOW = 1_000_000;
const ONLINE: PlayerPresence = { connected: true, disconnectedAt: null };

function gs(phase: GamePhase, playersReady: [boolean, boolean]): GameState {
    const empty = (i: 0 | 1): Player => ({ playerIndex: i, team: [] });
    return { phase, currentRound: 1, rollsLeft: 2, playersReady, priorityQueue: [], players: [empty(0), empty(1)] };
}

describe('evaluateClaim — forfeit ground', () => {
    const offline: PlayerPresence = { connected: false, disconnectedAt: NOW - 60_000 };

    it('valid when opponent disconnected for exactly the grace period', () => {
        expect(evaluateClaim(gs(GamePhase.KEEP, [false, false]), 0, offline, NOW - 10, NOW, CONFIG))
            .toEqual({ valid: true, reason: 'forfeit' });
    });

    it('invalid when disconnected for less than the grace period', () => {
        const recent: PlayerPresence = { connected: false, disconnectedAt: NOW - 59_999 };
        expect(evaluateClaim(gs(GamePhase.KEEP, [false, false]), 0, recent, NOW - 10, NOW, CONFIG).valid).toBe(false);
    });

    it('invalid when opponent is connected', () => {
        expect(evaluateClaim(gs(GamePhase.KEEP, [false, false]), 0, ONLINE, NOW - 10, NOW, CONFIG).valid).toBe(false);
    });
});

describe('evaluateClaim — AFK ground', () => {
    it('valid when claimant ready, opponent not, past the AFK limit in a confirm phase', () => {
        expect(evaluateClaim(gs(GamePhase.ASSIGN, [true, false]), 0, ONLINE, NOW - 120_000, NOW, CONFIG))
            .toEqual({ valid: true, reason: 'afk' });
    });

    it('invalid when the claimant has not confirmed', () => {
        expect(evaluateClaim(gs(GamePhase.ASSIGN, [false, false]), 0, ONLINE, NOW - 999_999, NOW, CONFIG).valid).toBe(false);
    });

    it('invalid in non-confirm phases', () => {
        expect(evaluateClaim(gs(GamePhase.RESULT, [true, false]), 0, ONLINE, NOW - 999_999, NOW, CONFIG).valid).toBe(false);
    });

    it('invalid when phaseStartedAt is unknown', () => {
        expect(evaluateClaim(gs(GamePhase.ASSIGN, [true, false]), 0, ONLINE, undefined, NOW, CONFIG).valid).toBe(false);
    });

    it('valid from player 1 seat when roles are mirrored', () => {
        expect(evaluateClaim(gs(GamePhase.ASSIGN, [false, true]), 1, ONLINE, NOW - 120_000, NOW, CONFIG))
            .toEqual({ valid: true, reason: 'afk' });
    });

    it('invalid for player 1 when only player 0 is ready', () => {
        expect(evaluateClaim(gs(GamePhase.ASSIGN, [true, false]), 1, ONLINE, NOW - 999_999, NOW, CONFIG).valid).toBe(false);
    });
});

describe('countdown helpers', () => {
    it('computeAfkClaimInMs returns remaining window, floored at 0', () => {
        expect(computeAfkClaimInMs(gs(GamePhase.KEEP, [false, false]), NOW - 100_000, NOW, 120_000)).toBe(20_000);
        expect(computeAfkClaimInMs(gs(GamePhase.KEEP, [false, false]), NOW - 500_000, NOW, 120_000)).toBe(0);
    });

    it('computeAfkClaimInMs is null when both ready, in non-confirm phases, or without a stamp', () => {
        expect(computeAfkClaimInMs(gs(GamePhase.KEEP, [true, true]), NOW - 1, NOW, 120_000)).toBeNull();
        expect(computeAfkClaimInMs(gs(GamePhase.RESOLVE, [false, false]), NOW - 1, NOW, 120_000)).toBeNull();
        expect(computeAfkClaimInMs(gs(GamePhase.KEEP, [false, false]), undefined, NOW, 120_000)).toBeNull();
    });

    it('computeForfeitClaimInMs returns remaining grace for a disconnected player, null when connected', () => {
        expect(computeForfeitClaimInMs({ connected: false, disconnectedAt: NOW - 15_000 }, NOW, 60_000)).toBe(45_000);
        expect(computeForfeitClaimInMs(ONLINE, NOW, 60_000)).toBeNull();
    });
});
