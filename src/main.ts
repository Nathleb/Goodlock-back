import { NestFactory } from '@nestjs/core';
import { readFileSync } from "fs";
import { AppModule } from './app.module';
import EffectFactory from './factories/EffectFactory';
import Player from './models/Player.model';
import CharacterGenerationService from './services/CharacterGeneration.service';
import GameInitService, { createGame } from './services/GameInit.service';
import SingleTargetDamage from './strategies/SingleTargetDamage';
import SingleTargetHeal from './strategies/SingleTargetHeal';
import SingleTargetShield from './strategies/SingleTargetShield';
import Position from './types/Position.type';
import { roll1D5 } from './utils/Random.utils';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);


  function main() {
    const characterGeneration = new CharacterGenerationService();
    EffectFactory.registerEffect("SingleTargetDamage", (amount, priority) => new SingleTargetDamage(amount, priority));
    EffectFactory.registerEffect("SingleTargetHeal", (amount, priority) => new SingleTargetHeal(amount, priority));
    EffectFactory.registerEffect("SingleTargetShield", (amount, priority) => new SingleTargetShield(amount, priority));

    const jsonCharacterTemplate = readFileSync("./Jason.json", 'utf-8');

    let team = [];
    for (let p = 0; p < 5; p++) {
      team.push(characterGeneration.createCharacterFromJsonTemplate(jsonCharacterTemplate));
    }
    const player1 = new Player(team);
    team = [];
    for (let p = 0; p < 5; p++) {
      team.push(characterGeneration.createCharacterFromJsonTemplate(jsonCharacterTemplate));
    }
    const player2 = new Player(team);

    // const game = createGame(player1, player2);

    while (!player1.hasLost && !player2.hasLost) {
      player1.rollDiceForTurn();
      player2.rollDiceForTurn();

      player1.team.forEach((_c, index: Position) => player1.selectCurrentTargetOfCharacter(index, { player: 1, position: roll1D5() }));

      player2.team.forEach((_c, index: Position) => player1.selectCurrentTargetOfCharacter(index, { player: 0, position: roll1D5() }));

    }

  }

  main();

}
bootstrap();
