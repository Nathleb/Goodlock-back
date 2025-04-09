import GameState from "../types/GameState.type";
import { createGameState } from "./gameInit.service";
import { rollDiceForTurn, selectTargetOfCharacter } from "./player.service";
import { addAllEffectsToPriorityQueue, unstackPriorityQueue } from "./priorityQueue.service";
import { Player } from "../types/Player.type";


export function logGameState(game: GameState) {
    console.log(`Round: ${game.currentRound}`);
    game.players.forEach((player, playerIndex) => {
        console.log(`Player ${playerIndex}:`);
        player.team.forEach((character, charIndex) => {
            console.log(`  Character ${charIndex} (${character.name}):`);
            console.log(`    HP: ${character.hp}/${character.maxHp}`);
            console.log(`    Shield: ${character.shield}`);
            console.log(`    Current Face: ${character.face}`);
            console.log(`    Target: Player ${character.target?.playerIndex}, Character ${character.target?.characterIndex}`);
        });
    });
}
