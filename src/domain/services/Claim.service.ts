import GameState from "../types/GameState.type";
import GamePhase from "../types/GamePhase.type";
import { PlayerIndex } from "../types/Position.type";
import { PlayerPresence } from "../types/Presence.type";
import { ClaimConfig, ClaimReason } from "../types/Claim.type";
import { DomainError, domainError } from "../errors/DomainError";
import { Result, ok, err } from "@shared/result.type";

const CONFIRM_PHASES: readonly GamePhase[] = [GamePhase.SELECTION, GamePhase.PLACEMENT, GamePhase.KEEP];

export function evaluateClaim(
    gs: GameState,
    claimantIndex: PlayerIndex,
    opponentPresence: PlayerPresence,
    phaseStartedAt: number | undefined,
    now: number,
    config: ClaimConfig,
): Result<ClaimReason, DomainError> {
    if (gs.phase === GamePhase.RESULT) {
        return err(domainError('CLAIM_NOT_ALLOWED', 'Game is already over'));
    }
    if (!opponentPresence.connected
        && opponentPresence.disconnectedAt !== null
        && now - opponentPresence.disconnectedAt >= config.graceMs) {
        return ok('forfeit');
    }
    const opponentIndex = (1 - claimantIndex) as PlayerIndex;
    if (CONFIRM_PHASES.includes(gs.phase)
        && gs.playersReady[claimantIndex]
        && !gs.playersReady[opponentIndex]
        && phaseStartedAt !== undefined
        && now - phaseStartedAt >= config.afkLimitMs) {
        return ok('afk');
    }
    return err(domainError('CLAIM_NOT_ALLOWED', 'No valid claim: opponent is neither forfeited nor AFK'));
}

/**
 * Viewer-agnostic countdown until the AFK window opens against the non-ready player.
 * Deliberately looser than evaluateClaim's AFK ground (no claimantIndex): the same value
 * is broadcast to the whole room; whether a specific player may actually claim is
 * enforced per-claimant by evaluateClaim at claim time.
 */
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
