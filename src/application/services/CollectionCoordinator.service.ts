import { BadRequestException, Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { CATALOG_PORT, COLLECTION_PORT } from '@application/ports/tokens';
import { CatalogPort } from '@application/ports/CatalogPort';
import { CollectionPort } from '@application/ports/CollectionPort';
import { CollectionDTO, CollectionCharacterDTO } from '@application/dtos/Collection.dto';
import { CollectionMapper } from '@application/mappers/CollectionMapper';
import { CatalogId, UserId } from '@shared/branded.types';

@Injectable()
export class CollectionCoordinatorService implements OnApplicationBootstrap {
    private readonly logger = new Logger(CollectionCoordinatorService.name);

    constructor(
        @Inject(CATALOG_PORT) private readonly catalog: CatalogPort,
        @Inject(COLLECTION_PORT) private readonly collection: CollectionPort,
    ) {}

    async getCollection(userId: UserId): Promise<CollectionDTO> {
        const owned = await this.collection.listOwned(userId);
        const characters: CollectionCharacterDTO[] = [];
        for (const row of owned) {
            // A character retired from the catalog must not break the player's collection.
            const template = this.catalog.get(row.characterId);
            if (template) characters.push(CollectionMapper.toDTO(template, row.acquiredAt));
        }
        return { characters };
    }

    /** The only write path into the collection: every id is checked against the catalog. */
    async grant(userId: UserId, ids: readonly CatalogId[]): Promise<void> {
        const unknown = ids.filter(id => !this.catalog.has(id));
        if (unknown.length > 0) throw new BadRequestException(`Unknown catalog ids: ${unknown.join(', ')}`);
        await this.collection.grantMany(userId, ids);
    }

    // TEMPORARY: everyone owns everything until acquisition exists; the acquisition slice removes this.
    async grantAll(userId: UserId): Promise<void> {
        await this.grant(userId, this.catalog.ids());
    }

    /** Stands in for the foreign key we deliberately don't have: flag owned ids the catalog can't resolve. */
    async onApplicationBootstrap(): Promise<void> {
        try {
            const unknown = await this.collection.listUnknownIds(this.catalog.ids());
            if (unknown.length > 0) {
                this.logger.warn(`Owned characters missing from the catalog: ${unknown.join(', ')}`);
            }
        } catch (e: unknown) {
            this.logger.error(`Collection consistency check failed: ${(e as Error).message}`);
        }
    }
}
