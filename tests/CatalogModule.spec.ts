import { Test } from '@nestjs/testing';
import { CatalogModule } from '@infrastructure/catalog.module';
import { CATALOG_PORT, EFFECT_FACTORY } from '@application/ports/tokens';
import { CatalogPort } from '@application/ports/CatalogPort';
import EffectFactory from '@domain/factories/EffectFactory.class';

describe('CatalogModule', () => {
    it('boots and serves the shipped templates plus the effect factory', async () => {
        const module = await Test.createTestingModule({ imports: [CatalogModule] }).compile();
        await module.init();

        const catalog = module.get<CatalogPort>(CATALOG_PORT);
        expect(catalog.list()).toHaveLength(10);
        expect(catalog.has(catalog.ids()[0])).toBe(true);
        expect(module.get<EffectFactory>(EFFECT_FACTORY)).toBeDefined();

        await module.close();
    });
});
