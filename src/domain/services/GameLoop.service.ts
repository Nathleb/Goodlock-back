import GameState from "../types/GameState.type";
import { createGameState } from "./GameInit.service";
import { rollRandomPosition3 } from "../utils/Random.utils";
import { rollDiceForTurn, selectTargetOfCharacter } from "./Player.service";
import { addAllEffectsToPriorityQueue, unstackPriorityQueue } from "./PriorityQueue.service";
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

export function runGameLoop(player1: Player, player2: Player) {
    let game = createGameState(player1, player2);

    while (game.currentRound < 3) {
        let [player1, player2] = game.players;
        rollDiceForTurn(player1);
        rollDiceForTurn(player2);

        for (const c of player1.team) {
            player1 = selectTargetOfCharacter(player1, c.position.characterIndex, rollRandomPosition3(player2.playerIndex));
            game.players[0] = player1;
        }
        for (const c of player2.team) {
            player2 = selectTargetOfCharacter(player2, c.position.characterIndex, rollRandomPosition3(player1.playerIndex));
            game.players[1] = player2;
        }


        addAllEffectsToPriorityQueue(game);
        game = { ...unstackPriorityQueue(game) };
        game.currentRound++;
        logGameState(game);
    }
}

