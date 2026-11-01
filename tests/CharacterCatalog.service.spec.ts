import { validateCatalog } from '@domain/services/CharacterCatalog.service';
import CharacterTemplate from '@domain/types/CharacterTemplate.type';
import { CatalogId } from '@shared/branded.types';

const template = (id: string | undefined, name = `Name-${id}`): CharacterTemplate =>
    ({ id: id as CatalogId, name, maxHp: 10, baseSpeed: 5, baseDieInstructions: [] }) as unknown as CharacterTemplate;

describe('validateCatalog', () => {
    it('accepts a catalog with unique well-formed ids', () => {
        expect(validateCatalog([template('alicent'), template('eve-2')])).toEqual([]);
    });

    it('accepts an empty catalog', () => {
        expect(validateCatalog([])).toEqual([]);
    });

    it('reports a template without an id, naming it', () => {
        const errors = validateCatalog([template(undefined, 'Alicent')]);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('Alicent');
    });

    it.each(['Alicent', 'ali cent', 'ali_cent', '', 'é'])('reports malformed id %p', (id) => {
        const errors = validateCatalog([template(id)]);
        expect(errors).toHaveLength(1);
    });

    it('reports a non-string id', () => {
        expect(validateCatalog([template(42 as unknown as string)])).toHaveLength(1);
    });

    it('reports each duplicated id once', () => {
        const errors = validateCatalog([template('eve', 'Eve'), template('eve', 'Eve bis'), template('eve', 'Eve ter')]);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toContain('eve');
    });
});

describe('validateCatalog messages', () => {
    it('names the template without an id', () => {
        expect(validateCatalog([template(undefined, 'Alicent')])).toEqual(['Template "Alicent" has no id']);
    });

    it('shows the malformed id and the expected pattern', () => {
        const [message] = validateCatalog([template('Ali cent', 'Alicent')]);
        expect(message).toMatch(/^Template "Alicent" has malformed id "Ali cent" \(expected \/.+\/\)$/);
    });
});
