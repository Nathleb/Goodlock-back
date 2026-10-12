import { Module } from '@nestjs/common';
import { COLLECTION_PORT } from '@application/ports/tokens';
import { CollectionCoordinatorService } from '@application/services/CollectionCoordinator.service';
import { UserCharacterRepository } from './adapters/repositories/UserCharacterRepository';
import { CatalogModule } from './catalog.module';

// Providers only: CollectionController lives in AppModule, because it needs JwtAccessGuard
// from AuthModule, and AuthModule imports this module (grant on register/login).
@Module({
    imports: [CatalogModule],
    providers: [
        CollectionCoordinatorService,
        { provide: COLLECTION_PORT, useClass: UserCharacterRepository },
    ],
    exports: [CollectionCoordinatorService],
})
export class CollectionModule {}
