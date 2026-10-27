import * as fs from "fs";
import * as path from "path";
import { loadCatalogFromDir } from "@infrastructure/adapters/catalog/FileCharacterCatalog";
import { buildEffectFactory } from "@domain/services/GameInit.service";

const tmpltDir = path.join(__dirname, "..", "tmplt");
const roster = fs.readdirSync(tmpltDir).filter(f => f.endsWith(".json"))
    .map(f => JSON.parse(fs.readFileSync(path.join(tmpltDir, f), "utf-8")));
type Face = { description: string; priority: number; effects: { effect: string; stat?: string; state?: string }[] };
const faces = roster.flatMap(c => c.baseDieInstructions as Face[]);

describe('the roster', () => {
    it('is the six characters of the dice authoring design', () => {
        expect(roster.map(c => c.id).sort()).toEqual(['garran', 'kesh', 'morrow', 'tobin', 'vespera', 'ysolde']);
    });

    it('follows the hit point and speed table of the design', () => {
        const byId = Object.fromEntries(roster.map(c => [c.id, [c.maxHp, c.baseSpeed]]));
        expect(byId).toEqual({
            garran: [110, 5], kesh: [80, 9], ysolde: [120, 3], morrow: [100, 6], vespera: [90, 7], tobin: [90, 8],
        });
    });

    it('gives every die six faces, with the blank faces of the design', () => {
        const blanks = Object.fromEntries(roster.map(c => [c.id, (c.baseDieInstructions as Face[]).filter(f => f.effects.length === 0).length]));
        expect(roster.every(c => c.baseDieInstructions.length === 6)).toBe(true);
        expect(blanks).toEqual({ garran: 1, kesh: 1, morrow: 0, tobin: 0, vespera: 1, ysolde: 0 });
    });

    it('uses these states and these stats', () => {
        const states = new Set(faces.flatMap(f => f.effects).filter(e => e.effect === 'ApplyState').map(e => e.state));
        const stats = new Set(faces.flatMap(f => f.effects).filter(e => e.effect === 'ApplyStat').map(e => e.stat));
        expect([...states].sort()).toEqual(['DIVINE_SHIELD', 'HASTE', 'POISON', 'ROOT', 'STUN']);
        expect([...stats].sort()).toEqual(['ARMOR', 'POWER']);
    });

    it('boots as the shipped catalog: validated, and every character can be built', () => {
        const templates = loadCatalogFromDir(tmpltDir, buildEffectFactory());
        expect(templates).toHaveLength(6);
    });
});
