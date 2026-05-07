import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { initializeEffects } from '@domain/services/GameInit.service';

async function bootstrap() {
    initializeEffects();
    const app = await NestFactory.create(AppModule);
    await app.listen(3000);
}

bootstrap();
