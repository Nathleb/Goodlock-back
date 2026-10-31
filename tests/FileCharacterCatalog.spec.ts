import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileCharacterCatalog, loadCatalogFromDir } from '@infrastructure/adapters/catalog/FileCharacterCatalog';
import { CatalogId } from '@shared/branded.types';


const face = { description: 'hit', priority: 0, effects: [{ effect: 'Damage', magnitude: 1, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }] }] };
const template = (fields: Record<string, unknown>) => ({ name: 'N', maxHp: 10, baseSpeed: 5, baseDieInstructions: Array(6).fill(face), ...fields });

let dir: string;

function writeTemplates(files: Record<string, unknown>): void {
    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
    }
}

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('loadCatalogFromDir', () => {
    it('loads every .json template and ignores other files', () => {
        writeTemplates({
            'A.json': template({ id: 'alicent', name: 'Alicent' }),
            'B.json': template({ id: 'bob', name: 'Bob' }),
            'notes.txt': 'not a template',
        });
        const templates = loadCatalogFromDir(dir);
        expect(templates.map(t => t.id).sort()).toEqual(['alicent', 'bob']);
    });

    it('throws on duplicate ids', () => {
        writeTemplates({ 'A.json': template({ id: 'same' }), 'B.json': template({ id: 'same' }) });
        expect(() => loadCatalogFromDir(dir)).toThrow(/Duplicate catalog id "same"/);
    });

    it('throws on a template without an id', () => {
        writeTemplates({ 'A.json': template({ name: 'Nameless' }) });
        expect(() => loadCatalogFromDir(dir)).toThrow(/Nameless/);
    });

    it('throws on invalid JSON, naming the file', () => {
        writeTemplates({ 'Broken.json': '{ nope' });
        expect(() => loadCatalogFromDir(dir)).toThrow(/Broken\.json/);
    });

    it('throws on an effect that fails target validation, naming the file', () => {
        const badFace = { ...face, effects: [{ effect: 'Swap', magnitude: 0, targets: [{ side: 'ALLY', mode: 'RELATIVE', n: [0, 1, 2] }] }] };
        writeTemplates({ 'Bad.json': template({ id: 'bad', baseDieInstructions: Array(6).fill(badFace) }) });
        expect(() => loadCatalogFromDir(dir)).toThrow(/Bad\.json/);
    });

    it('throws on an empty catalog', () => {
        expect(() => loadCatalogFromDir(dir)).toThrow(/no character templates/i);
    });
});

describe('FileCharacterCatalog', () => {
    it('serves the loaded templates after init', () => {
        writeTemplates({ 'A.json': template({ id: 'alicent', name: 'Alicent' }), 'B.json': template({ id: 'bob', name: 'Bob' }) });
        const catalog = new FileCharacterCatalog(dir);
        catalog.onModuleInit();

        expect(catalog.list()).toHaveLength(2);
        expect(catalog.ids()).toEqual(expect.arrayContaining(['alicent', 'bob']));
        expect(catalog.has('alicent' as CatalogId)).toBe(true);
        expect(catalog.get('alicent' as CatalogId)?.name).toBe('Alicent');
        expect(catalog.has('ghost' as CatalogId)).toBe(false);
        expect(catalog.get('ghost' as CatalogId)).toBeUndefined();
    });

    it('fails init on a bad catalog', () => {
        writeTemplates({ 'A.json': template({ id: 'same' }), 'B.json': template({ id: 'same' }) });
        expect(() => new FileCharacterCatalog(dir).onModuleInit()).toThrow();
    });
});
