import * as fs from "fs";
import * as path from "path";
import { createCharacterFromJsonTemplate } from "@domain/services/CharacterGeneration.service";
import { buildEffectFactory } from "@domain/services/GameInit.service";
import { validateCatalog } from "@domain/services/CharacterCatalog.service";

const tmpltDir = path.join(__dirname, "..", "tmplt");
const files = fs.readdirSync(tmpltDir).filter(f => f.endsWith(".json"));

describe("character templates", () => {
  it("finds at least one template", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s parses into a valid character", (file) => {
    const content = fs.readFileSync(path.join(tmpltDir, file), "utf-8");
    const factory = buildEffectFactory();
    expect(() => createCharacterFromJsonTemplate(content, factory)).not.toThrow();
  });

  it("forms a valid catalog (every template has a unique, well-formed id)", () => {
    const templates = files.map(f => JSON.parse(fs.readFileSync(path.join(tmpltDir, f), "utf-8")));
    expect(validateCatalog(templates)).toEqual([]);
  });

  it.each(files)("%s uses small integer priority brackets in [-2, 3]", (file) => {
    const tmpl = JSON.parse(fs.readFileSync(path.join(tmpltDir, file), "utf-8"));
    for (const face of tmpl.baseDieInstructions) {
      expect(Number.isInteger(face.priority)).toBe(true);
      expect(face.priority).toBeGreaterThanOrEqual(-2);
      expect(face.priority).toBeLessThanOrEqual(3);
    }
  });

  it.each(files)("%s has a widened baseSpeed (>= 2)", (file) => {
    const tmpl = JSON.parse(fs.readFileSync(path.join(tmpltDir, file), "utf-8"));
    expect(tmpl.baseSpeed).toBeGreaterThanOrEqual(2);
  });

  it.each(files)("%s has no targetConstraint and targets on every effect", (file) => {
    const tmpl = JSON.parse(fs.readFileSync(path.join(tmpltDir, file), "utf-8"));
    for (const face of tmpl.baseDieInstructions) {
      expect(face.targetConstraint).toBeUndefined();
      for (const e of face.effects) {
        expect(["Damage", "Heal", "Shield", "Swap"]).toContain(e.effect);
        expect(Array.isArray(e.targets) && e.targets.length > 0).toBe(true);
      }
    }
  });
});
