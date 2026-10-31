import * as fs from 'fs';
import * as path from 'path';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { CATALOG_DIR } from '@application/ports/tokens';
import { CatalogPort } from '@application/ports/CatalogPort';
import CharacterTemplate from '@domain/types/CharacterTemplate.type';
import { validateCatalog } from '@domain/services/CharacterCatalog.service';
import { createCharacterFromTemplate } from '@domain/services/CharacterGeneration.service';
import { CatalogId } from '@shared/branded.types';

/**
 * Reads, validates and test-builds every template in `dir`.
 * Throws on any problem: a bad catalog must stop the app at boot, not break a match.
 */
export function loadCatalogFromDir(dir: string): CharacterTemplate[] {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    if (files.length === 0) throw new Error(`Catalog: no character templates found in ${dir}`);

    const templates = files.map(file => {
        try {
            return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8')) as CharacterTemplate;
        } catch (e: unknown) {
            throw new Error(`Catalog: ${file} is not valid JSON (${(e as Error).message})`);
        }
    });

    const errors = validateCatalog(templates);
    if (errors.length > 0) throw new Error(`Catalog is invalid:\n- ${errors.join('\n- ')}`);

    // Building each character once surfaces effect and target errors at boot.
    templates.forEach((template, i) => {
        try {
            createCharacterFromTemplate(template);
        } catch (e: unknown) {
            throw new Error(`Catalog: ${files[i]} cannot be built (${(e as Error).message})`);
        }
    });

    return templates;
}

/** Catalog backed by the git-authored `tmplt/*.json` files, cached for the life of the process. */
@Injectable()
export class FileCharacterCatalog implements CatalogPort, OnModuleInit {
    private templates = new Map<CatalogId, CharacterTemplate>();

    constructor(@Inject(CATALOG_DIR) private readonly dir: string) {}

    onModuleInit(): void {
        const loaded = loadCatalogFromDir(this.dir);
        this.templates = new Map(loaded.map(t => [t.id, t]));
    }

    list(): readonly CharacterTemplate[] {
        return [...this.templates.values()];
    }

    get(id: CatalogId): CharacterTemplate | undefined {
        return this.templates.get(id);
    }

    has(id: CatalogId): boolean {
        return this.templates.has(id);
    }

    ids(): readonly CatalogId[] {
        return [...this.templates.keys()];
    }
}
