import GameState from "../types/GameState.type";
import GamePhase from "../types/GamePhase.type";
import { PlayerIndex } from "../types/Position.type";
import { PlayerPresence } from "../types/Presence.type";
import { ClaimConfig, ClaimVerdict } from "../types/Claim.type";

const CONFIRM_PHASES: readonly GamePhase[] = [GamePhase.PLACEMENT, GamePhase.KEEP, GamePhase.ASSIGN];

export function evaluateClaim(
    gs: GameState,
    claimantIndex: PlayerIndex,
    opponentPresence: PlayerPresence,
    phaseStartedAt: number | undefined,
    now: number,
    config: ClaimConfig,
): ClaimVerdict {
    if (!opponentPresence.connected
        && opponentPresence.disconnectedAt !== null
        && now - opponentPresence.disconnectedAt >= config.graceMs) {
        return { valid: true, reason: 'forfeit' };
    }
    const opponentIndex = (1 - claimantIndex) as PlayerIndex;
    if (CONFIRM_PHASES.includes(gs.phase)
        && gs.playersReady[claimantIndex]
        && !gs.playersReady[opponentIndex]
        && phaseStartedAt !== undefined
        && now - phaseStartedAt >= config.afkLimitMs) {
        return { valid: true, reason: 'afk' };
    }
    return { valid: false, error: 'No valid claim: opponent is neither forfeited nor AFK' };
}

export function computeAfkClaimInMs(
    gs: GameState,
    phaseStartedAt: number | undefined,
    now: number,
    afkLimitMs: number,
): number | null {
    if (!CONFIRM_PHASES.includes(gs.phase)) return null;
    if (phaseStartedAt === undefined) return null;
    if (gs.playersReady[0] && gs.playersReady[1]) return null;
    return Math.max(0, afkLimitMs - (now - phaseStartedAt));
}

export function computeForfeitClaimInMs(presence: PlayerPresence, now: number, graceMs: number): number | null {
    if (presence.connected || presence.disconnectedAt === null) return null;
    return Math.max(0, graceMs - (now - presence.disconnectedAt));
}
