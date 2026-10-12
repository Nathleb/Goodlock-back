import { Module } from '@nestjs/common';
import { DECK_PORT } from '@application/ports/tokens';
import { DeckCoordinatorService } from '@application/services/DeckCoordinator.service';
import { DeckRepository } from './adapters/repositories/DeckRepository';
import { CatalogModule } from './catalog.module';
import { CollectionModule } from './collection.module';

// Providers only: DeckController lives in AppModule, for the same reason as CollectionController
// (AuthModule imports this module for the starter deck, and the controller needs JwtAccessGuard).
@Module({
    imports: [CatalogModule, CollectionModule],
    providers: [
        DeckCoordinatorService,
        { provide: DECK_PORT, useClass: DeckRepository },
    ],
    exports: [DeckCoordinatorService],
})
export class DeckModule {}
