import { CatalogId } from '@shared/branded.types';
import { CatalogPort } from '@application/ports/CatalogPort';
import CharacterTemplate from '@domain/types/CharacterTemplate.type';
import { BaseDieInstructions } from '@domain/types/BaseDieInstructions.type';

/** Catalog id for test characters that don't come from a real template. */
export const TEST_CATALOG_ID = 'test' as CatalogId;

const NOOP_FACE = { description: 'noop', priority: 0, effects: [] };
const NOOP_DIE: BaseDieInstructions = [NOOP_FACE, NOOP_FACE, NOOP_FACE, NOOP_FACE, NOOP_FACE, NOOP_FACE];

export function testTemplate(id: string): CharacterTemplate {
    return { id: id as CatalogId, name: `Name-${id}`, maxHp: 10, baseSpeed: 5, baseDieInstructions: NOOP_DIE };
}

/** In-memory CatalogPort with templates `c0`..`c{count-1}`. */
export function makeTestCatalog(count: number): CatalogPort {
    const templates = Array.from({ length: count }, (_, i) => testTemplate(`c${i}`));
    const byId = new Map(templates.map(t => [t.id, t]));
    return {
        list: () => templates,
        get: (id) => byId.get(id),
        has: (id) => byId.has(id),
        ids: () => templates.map(t => t.id),
    };
}
