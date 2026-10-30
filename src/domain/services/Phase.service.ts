import GameState from "../types/GameState.type";
import GamePhase from "../types/GamePhase.type";
import { PlayerIndex } from "../types/Position.type";
import { DomainError, domainError } from "../errors/DomainError";
import { Result, ok, err } from "@shared/result.type";

export function checkPhase(gs: GameState, expected: GamePhase): Result<GameState, DomainError> {
    return gs.phase === expected
        ? ok(gs)
        : err(domainError('WRONG_PHASE', `Expected phase ${expected}, got ${gs.phase}`));
}

export function checkNotReady(gs: GameState, playerIndex: PlayerIndex): Result<GameState, DomainError> {
    return gs.playersReady[playerIndex]
        ? err(domainError('ALREADY_CONFIRMED', 'Player has already confirmed'))
        : ok(gs);
}

// Throwing forms of the checks above, kept for the paths that are not migrated to Result yet.
export function assertPhase(gameState: GameState, expected: GamePhase): void {
    const checked = checkPhase(gameState, expected);
    if (checked.isErr()) throw new Error(checked.error.message);
}

export function assertNotReady(gs: GameState, playerIndex: PlayerIndex): void {
    const checked = checkNotReady(gs, playerIndex);
    if (checked.isErr()) throw new Error(checked.error.message);
}

export const beginPlacementPhase = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.PLACEMENT });
export const beginRollPhase      = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.ROLL });
export const beginKeepPhase      = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.KEEP });
export const beginResolvePhase   = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.RESOLVE });
export const beginResultPhase    = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.RESULT });
