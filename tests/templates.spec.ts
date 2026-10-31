import * as fs from "fs";
import * as path from "path";
import { createCharacterFromTemplate } from "@domain/services/CharacterGeneration.service";
import { validateCatalog } from "@domain/services/CharacterCatalog.service";

const tmpltDir = path.join(__dirname, "..", "tmplt");
const files = fs.readdirSync(tmpltDir).filter(f => f.endsWith(".json"));

describe("character templates", () => {
  it("finds at least one template", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s parses into a valid character", (file) => {
    const content = fs.readFileSync(path.join(tmpltDir, file), "utf-8");
    expect(() => createCharacterFromTemplate(JSON.parse(content))).not.toThrow();
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
        expect(["Damage", "FixedDamage", "Heal", "Shield", "Swap", "ApplyStat", "ApplyState"]).toContain(e.effect);
        expect(Array.isArray(e.targets) && e.targets.length > 0).toBe(true);
      }
    }
  });

  it("Alicent's self-cost face sacrifices HP with FixedDamage, not Damage", () => {
    // Alicent now lives in the test templates (tests/fixtures/characters), no longer in the shipped roster.
    const tmpl = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "characters", "Alicent.json"), "utf-8"));
    const face = tmpl.baseDieInstructions.find((f: { description: string }) => f.description.startsWith("Take 3 damage"));
    expect(face.effects[0]).toMatchObject({ effect: "FixedDamage", magnitude: 3, targets: [{ side: "ALLY" }] });
  });

  it("Garran's self-cost face sacrifices HP with FixedDamage, not Damage", () => {
    const tmpl = JSON.parse(fs.readFileSync(path.join(tmpltDir, "Garran.json"), "utf-8"));
    const face = tmpl.baseDieInstructions.find((f: { description: string }) => f.description.startsWith("Take 8 damage"));
    expect(face.effects[0]).toMatchObject({ effect: "FixedDamage", magnitude: 8, targets: [{ side: "ALLY" }] });
    expect(face.effects[1]).toMatchObject({ effect: "Damage", magnitude: 26, targets: [{ side: "ENEMY" }] });
  });
});
