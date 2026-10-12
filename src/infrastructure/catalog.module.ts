import * as path from 'path';
import { Module } from '@nestjs/common';
import { CATALOG_DIR, CATALOG_PORT, EFFECT_FACTORY } from '@application/ports/tokens';
import { buildEffectFactory } from '@domain/services/GameInit.service';
import { FileCharacterCatalog } from './adapters/catalog/FileCharacterCatalog';

@Module({
    providers: [
        { provide: EFFECT_FACTORY, useValue: buildEffectFactory() },
        { provide: CATALOG_DIR, useValue: path.join(process.cwd(), 'tmplt') },
        { provide: CATALOG_PORT, useClass: FileCharacterCatalog },
    ],
    exports: [EFFECT_FACTORY, CATALOG_PORT],
})
export class CatalogModule {}
