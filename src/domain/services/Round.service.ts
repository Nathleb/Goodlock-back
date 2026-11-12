import GameState from "../types/GameState.type";
import { resetShield, tickModifiers, tickStates } from "./Character.service";
import { hasLost, unlockAllDice } from "./Player.service";
import { Player } from "../types/Player.type";
import { PlayerIndex } from "../types/Position.type";

export function endOfRound(gameState: GameState): GameState {
    const updatedPlayers = gameState.players.map(player => {
        const unlocked = unlockAllDice(player);
        return { ...unlocked, team: unlocked.team.map(c => tickStates(tickModifiers(resetShield(c), gameState.currentRound), gameState.currentRound)) };
    }) as unknown as [Player, Player];
    return {
        ...gameState,
        players: updatedPlayers,
        currentRound: gameState.currentRound + 1,
        initiativePlayerIndex: (1 - gameState.initiativePlayerIndex) as PlayerIndex,
        rollsLeft: 2,
        playersReady: [false, false],
    };
}

/**
 * Decides the match when a player has 2 dead characters (GAME-4). When both have, the author of
 * the effect that just applied loses (END-2). A decided match stays decided.
 */
export function checkMatchEnd(gameState: GameState, author: PlayerIndex): GameState {
    if (gameState.winner !== undefined) return gameState;
    const lost = gameState.players.map(hasLost);
    if (!lost[0] && !lost[1]) return gameState;
    const loser = lost[0] && lost[1] ? author : lost[0] ? 0 : 1;
    return { ...gameState, winner: (1 - loser) as PlayerIndex };
}

/** The winner of a finished match, null while it goes on. There is no draw (END-1). */
export function checkWinner(gameState: GameState): PlayerIndex | null {
    return gameState.winner ?? null;
}
