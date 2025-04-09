import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { runGameLoop } from './domain/services/gameLoop.service';
import { createPlayer } from './domain/services/player.service';
import { createTeamsFromTemplates, initializeEffects } from './domain/services/gameInit.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);

  function main() {
    initializeEffects();

    const team1Templates = [
      "./tmplt/Jason.json",
      "./tmplt/Alicent.json",
      "./tmplt/Robbert.json",
      "./tmplt/Charlie.json",
      "./tmplt/Diana.json"
    ];

    const team2Templates = [
      "./tmplt/Edward.json",
      "./tmplt/Fiona.json",
      "./tmplt/George.json",
      "./tmplt/Hannah.json",
      "./tmplt/Eve.json"
    ];

    const team1 = createTeamsFromTemplates(team1Templates);
    const team2 = createTeamsFromTemplates(team2Templates);

    const player1 = createPlayer(team1, 0);
    const player2 = createPlayer(team2, 1);

    runGameLoop(player1, player2);
  }

  main();
}

bootstrap();