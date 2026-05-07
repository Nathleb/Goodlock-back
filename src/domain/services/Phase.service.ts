import GameState from "../types/GameState.type";
import GamePhase from "../types/GamePhase.type";

export function assertPhase(gameState: GameState, expected: GamePhase): void {
    if (gameState.phase !== expected) {
        throw new Error(`Expected phase ${expected}, got ${gameState.phase}`);
    }
}

export const beginPlacementPhase = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.PLACEMENT });
export const beginRollPhase      = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.ROLL });
export const beginKeepPhase      = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.KEEP });
export const beginAssignPhase    = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.ASSIGN });
export const beginResolvePhase   = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.RESOLVE });
export const beginResultPhase    = (gs: GameState): GameState => ({ ...gs, phase: GamePhase.RESULT });
