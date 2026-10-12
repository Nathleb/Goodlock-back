import CharacterTemplate from "../types/CharacterTemplate.type";

// Catalog ids are stored in database rows, so they must stay stable and boring.
const CATALOG_ID_PATTERN = /^[a-z0-9-]+$/;

/**
 * Checks catalog-level invariants (id presence, shape, uniqueness).
 * Per-template effect/target validation happens when the die is built.
 */
export function validateCatalog(templates: readonly CharacterTemplate[]): string[] {
    const errors: string[] = [];
    const seen = new Set<string>();
    const reported = new Set<string>();

    for (const template of templates) {
        const id: unknown = template.id;
        if (id === undefined) {
            errors.push(`Template "${template.name}" has no id`);
            continue;
        }
        if (typeof id !== 'string' || !CATALOG_ID_PATTERN.test(id)) {
            errors.push(`Template "${template.name}" has malformed id ${JSON.stringify(id)} (expected ${CATALOG_ID_PATTERN})`);
            continue;
        }
        if (seen.has(id) && !reported.has(id)) {
            errors.push(`Duplicate catalog id "${id}"`);
            reported.add(id);
        }
        seen.add(id);
    }
    return errors;
}
