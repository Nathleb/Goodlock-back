import { createGameState } from "./GameInit.service";


function logGameState(game) {
    console.log(`Round: ${game.currentRound}`);
    game.players.forEach((player, playerIndex) => {
        console.log(`Player ${playerIndex + 1}:`);
        player.team.forEach((character, charIndex) => {
            console.log(`  Character ${charIndex + 1} (${character.name}):`);
            console.log(`    HP: ${character.currentHp}/${character.maxHp}`);
            console.log(`    Shield: ${character.currentShield}`);
            console.log(`    Current Face: ${character.currentFace.map(effect => `${effect.effect} (${effect.magnitude})`).join(', ')}`);
            console.log(`    Target: Player ${character.currentTarget?.playerIndex + 1}, Character ${character.currentTarget?.characterIndex + 1}`);
        });
    });
}

export function runGameLoop(player1, player2) {
    const game = createGameState(player1, player2);

    // while (!hasLost(player1) && !hasLost(player2)) {
        // rollDiceForTurn(player1);
        // rollDiceForTurn(player2);

        // player1.team.forEach((_c, index: Position) => selectCurrentTargetOfCharacter(player1, index, rollRandomPosition(1)));
        // player2.team.forEach((_c, index: Position) => selectCurrentTargetOfCharacter(player2, index, rollRandomPosition(0)));

        // addAllEffectsToPriorityQueue(game);
        // unstackPriorityQueue(game);

        logGameState(game);
    // }
}
