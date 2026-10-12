import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CATALOG_PORT, DECK_PORT } from '@application/ports/tokens';
import { CatalogPort } from '@application/ports/CatalogPort';
import { DeckContent, DeckPort, DeckRecord } from '@application/ports/DeckPort';
import { DeckDTO, DeckListDTO } from '@application/dtos/Deck.dto';
import { DeckMapper } from '@application/mappers/DeckMapper';
import { CollectionCoordinatorService } from '@application/services/CollectionCoordinator.service';
import { DECK_SIZE, MAX_DECKS_PER_USER, validateDeck } from '@domain/services/Deck.service';
import { CatalogId, DeckId, UserId } from '@shared/branded.types';

const NAME_MAX_LENGTH = 30;
const STARTER_DECK_NAME = 'Starter';

type SaveDeckInput = { readonly name: string; readonly characterIds: readonly string[] };

@Injectable()
export class DeckCoordinatorService {
    constructor(
        @Inject(DECK_PORT) private readonly decks: DeckPort,
        @Inject(CATALOG_PORT) private readonly catalog: CatalogPort,
        private readonly collection: CollectionCoordinatorService,
    ) {}

    async list(userId: UserId): Promise<DeckListDTO> {
        const decks = await this.decks.listByUser(userId);
        return { decks: decks.map(DeckMapper.toDTO) };
    }

    async create(userId: UserId, input: SaveDeckInput): Promise<DeckDTO> {
        const content = await this.validated(userId, input);
        // Count-then-insert: two simultaneous creates could exceed the limit by one. Accepted for now.
        if (await this.decks.countByUser(userId) >= MAX_DECKS_PER_USER) {
            throw new ConflictException(`You can have at most ${MAX_DECKS_PER_USER} decks`);
        }
        return DeckMapper.toDTO(await this.decks.create(userId, content));
    }

    async update(userId: UserId, deckId: DeckId, input: SaveDeckInput): Promise<DeckDTO> {
        await this.findOwnDeck(userId, deckId);
        const content = await this.validated(userId, input);
        return DeckMapper.toDTO(await this.decks.update(deckId, content));
    }

    async delete(userId: UserId, deckId: DeckId): Promise<void> {
        await this.findOwnDeck(userId, deckId);
        // Match entry (slice C) relies on every player having at least one deck.
        if (await this.decks.countByUser(userId) <= 1) throw new ConflictException('You cannot delete your last deck');
        await this.decks.delete(deckId);
    }

    // TEMPORARY: the starter deck is simply the first catalog ids, sorted, while the game is being built.
    async ensureStarterDeck(userId: UserId): Promise<void> {
        if (await this.decks.countByUser(userId) > 0) return;
        const ids = [...this.catalog.ids()].sort().slice(0, DECK_SIZE);
        await this.create(userId, { name: STARTER_DECK_NAME, characterIds: ids });
    }

    /** Another user's deck answers exactly like a missing one, so deck ids can't be probed. */
    private async findOwnDeck(userId: UserId, deckId: DeckId): Promise<DeckRecord> {
        const deck = await this.decks.findById(deckId);
        if (!deck || deck.userId !== userId) throw new NotFoundException('Deck not found');
        return deck;
    }

    private async validated(userId: UserId, input: SaveDeckInput): Promise<DeckContent> {
        const name = input.name.trim();
        const characterIds = input.characterIds as readonly CatalogId[];
        const owned = await this.collection.ownedIds(userId);

        const errors = validateDeck(characterIds, { isKnown: id => this.catalog.has(id), isOwned: id => owned.has(id) });
        if (name.length === 0 || name.length > NAME_MAX_LENGTH) {
            errors.unshift(`Deck name must be 1 to ${NAME_MAX_LENGTH} characters`);
        }
        if (errors.length > 0) throw new BadRequestException(errors);
        return { name, characterIds };
    }
}
