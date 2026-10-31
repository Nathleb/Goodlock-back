import * as path from 'path';
import { Test } from '@nestjs/testing';
import { CatalogModule } from '@infrastructure/catalog.module';
import { CATALOG_DIR, CATALOG_PORT } from '@application/ports/tokens';
import { CatalogPort } from '@application/ports/CatalogPort';

describe('CatalogModule', () => {
    it('boots and serves the test templates', async () => {
        // The test templates, not the shipped roster: the roster can change without touching this test.
        const module = await Test.createTestingModule({ imports: [CatalogModule] })
            .overrideProvider(CATALOG_DIR).useValue(path.join(__dirname, 'fixtures', 'characters'))
            .compile();
        await module.init();

        const catalog = module.get<CatalogPort>(CATALOG_PORT);
        expect(catalog.list()).toHaveLength(10);
        expect(catalog.has(catalog.ids()[0])).toBe(true);

        await module.close();
    });
});
