import GameState from "@domain/types/GameState.type";
import GamePhase from "@domain/types/GamePhase.type";
import { createPriorityQueue } from "@domain/services/PriorityQueue.service";
import { Player } from "@domain/types/Player.type";
import { PlayerIndex } from "@domain/types/Position.type";

export function createGameState(player1: Player, player2: Player, initiativePlayerIndex: PlayerIndex = 0): GameState {
    return {
        phase: GamePhase.PLACEMENT,
        currentRound: 0,
        initiativePlayerIndex,
        rollsLeft: 2,
        playersReady: [false, false],
        priorityQueue: createPriorityQueue(),
        players: [player1, player2],
    };
}
