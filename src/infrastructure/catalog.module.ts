import * as path from 'path';
import { Module } from '@nestjs/common';
import { CATALOG_DIR, CATALOG_PORT } from '@application/ports/tokens';
import { FileCharacterCatalog } from './adapters/catalog/FileCharacterCatalog';

@Module({
    providers: [
        { provide: CATALOG_DIR, useValue: path.join(process.cwd(), 'tmplt') },
        { provide: CATALOG_PORT, useClass: FileCharacterCatalog },
    ],
    exports: [CATALOG_PORT],
})
export class CatalogModule {}
