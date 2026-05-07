import GameState from "../types/GameState.type";
import { resetShield } from "./Character.service";
import { hasLost, unlockAllDice } from "./Player.service";
import { Player } from "../types/Player.type";

export function endOfRound(gameState: GameState): GameState {
    const updatedPlayers = gameState.players.map(player => {
        const unlocked = unlockAllDice(player);
        return { ...unlocked, team: unlocked.team.map(resetShield) };
    }) as [Player, Player];
    return {
        ...gameState,
        players: updatedPlayers,
        currentRound: gameState.currentRound + 1,
        rollsLeft: 2,
        playersReady: [false, false],
    };
}

export function checkWinner(gameState: GameState): 0 | 1 | 'draw' | null {
    const p0lost = hasLost(gameState.players[0]);
    const p1lost = hasLost(gameState.players[1]);
    if (p0lost && p1lost) return 'draw';
    if (p0lost) return 1;
    if (p1lost) return 0;
    return null;
}
