import { NestFactory } from '@nestjs/core';
import { readFileSync } from "fs";
import { AppModule } from './app.module';
import EffectFactory from './factories/EffectFactory';
import { createCharacterFromJsonTemplate } from './services/CharacterGeneration.service';
import { createGameState } from './services/GameInit.service';
import { createPlayer, hasLost, rollDiceForTurn, selectCurrentTargetOfCharacter } from './services/Player.service';
import { addAllEffectsToPriorityQueue, unstackPriorityQueue } from './services/PriorityQueue.service';
import SingleTargetDamage from './strategies/SingleTargetDamage';
import SingleTargetHeal from './strategies/SingleTargetHeal';
import SingleTargetShield from './strategies/SingleTargetShield';
import Position from './types/Position.type';
import { rollRandomPosition } from './utils/Random.utils';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);


  function main() {
    EffectFactory.registerEffect("SingleTargetDamage", (amount, priority) => new SingleTargetDamage(amount, priority));
    EffectFactory.registerEffect("SingleTargetHeal", (amount, priority) => new SingleTargetHeal(amount, priority));
    EffectFactory.registerEffect("SingleTargetShield", (amount, priority) => new SingleTargetShield(amount, priority));

    const jsonCharacterTemplate = readFileSync("./Jason.json", 'utf-8');

    let team = [];
    for (let p = 0; p < 5; p++) {
      team.push(createCharacterFromJsonTemplate(jsonCharacterTemplate));
    }
    const player1 = createPlayer(team);
    team = [];
    for (let p = 0; p < 5; p++) {
      team.push(createCharacterFromJsonTemplate(jsonCharacterTemplate));
    }
    const player2 = createPlayer(team);

    const game = createGameState(player1, player2);

    while (!hasLost(player1) && !hasLost(player2)) {
      rollDiceForTurn(player1);
      rollDiceForTurn(player2);

      player1.team.forEach((_c, index: Position) => selectCurrentTargetOfCharacter(player1, index, { player: 1, position: rollRandomPosition() }));

      player2.team.forEach((_c, index: Position) => selectCurrentTargetOfCharacter(player2, index, { player: 0, position: rollRandomPosition() }));

      addAllEffectsToPriorityQueue(game);

      unstackPriorityQueue(game);
    }

  }

  main();

}
bootstrap();
