import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DeckCoordinatorService } from '@application/services/DeckCoordinator.service';
import { CollectionCoordinatorService } from '@application/services/CollectionCoordinator.service';
import { DeckContent, DeckPort, DeckRecord } from '@application/ports/DeckPort';
import { CatalogId, DeckId, UserId } from '@shared/branded.types';
import { makeTestCatalog } from './helpers/catalog';

const ALICE = 'alice' as UserId;
const BOB = 'bob' as UserId;
const SIX = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'];

/** In-memory DeckPort: enough behaviour to test the coordinator's rules. */
class FakeDeckPort implements DeckPort {
    decks: DeckRecord[] = [];
    private next = 0;

    async listByUser(userId: UserId) { return this.decks.filter(d => d.userId === userId); }
    async findById(id: DeckId) { return this.decks.find(d => d.id === id); }
    async countByUser(userId: UserId) { return this.decks.filter(d => d.userId === userId).length; }
    async create(userId: UserId, content: DeckContent) {
        const now = new Date('2026-10-12T10:00:00.000Z');
        const deck: DeckRecord = { id: `d${this.next++}` as DeckId, userId, ...content, createdAt: now, updatedAt: now };
        this.decks.push(deck);
        return deck;
    }
    async update(id: DeckId, content: DeckContent) {
        const i = this.decks.findIndex(d => d.id === id);
        this.decks[i] = { ...this.decks[i], ...content };
        return this.decks[i];
    }
    async delete(id: DeckId) { this.decks = this.decks.filter(d => d.id !== id); }
}

let decks: FakeDeckPort;
let owned: Set<string>;
let coordinator: DeckCoordinatorService;

const collection = { ownedIds: jest.fn(async () => owned as unknown as ReadonlySet<CatalogId>) };
const save = (name: string, characterIds: string[] = SIX) => ({ name, characterIds });

beforeEach(() => {
    jest.clearAllMocks();
    decks = new FakeDeckPort();
    owned = new Set(['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7']);
    coordinator = new DeckCoordinatorService(decks, makeTestCatalog(8), collection as unknown as CollectionCoordinatorService);
});

describe('list', () => {
    it("returns only the user's decks, as DTOs", async () => {
        await decks.create(ALICE, { name: 'Mine', characterIds: SIX as CatalogId[] });
        await decks.create(BOB, { name: 'Theirs', characterIds: SIX as CatalogId[] });

        const { decks: list } = await coordinator.list(ALICE);

        expect(list).toEqual([{ id: 'd0', name: 'Mine', characterIds: SIX, createdAt: '2026-10-12T10:00:00.000Z', updatedAt: '2026-10-12T10:00:00.000Z' }]);
    });
});

describe('create', () => {
    it('saves a valid deck with a trimmed name', async () => {
        const dto = await coordinator.create(ALICE, save('  Aggro  '));
        expect(dto.name).toBe('Aggro');
        expect(dto.characterIds).toEqual(SIX);
        expect(collection.ownedIds).toHaveBeenCalledWith(ALICE);
    });

    it('rejects an invalid composition with every reason', async () => {
        owned.delete('c5');
        const attempt = coordinator.create(ALICE, save('Bad', ['c0', 'c0', 'c1', 'ghost', 'c5']));
        await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
        await attempt.catch((e: BadRequestException) => {
            const messages = (e.getResponse() as { message: string[] }).message;
            expect(messages).toHaveLength(4); // size, duplicate, unknown, unowned
        });
        expect(decks.decks).toHaveLength(0);
    });

    it.each(['', '   ', 'x'.repeat(31)])('rejects name %p', async (name) => {
        await expect(coordinator.create(ALICE, save(name))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a sixth deck', async () => {
        for (let i = 0; i < 5; i++) await coordinator.create(ALICE, save(`D${i}`));
        await expect(coordinator.create(ALICE, save('Too many'))).rejects.toBeInstanceOf(ConflictException);
        expect(await decks.countByUser(ALICE)).toBe(5);
    });
});

describe('update', () => {
    it('replaces name and characters', async () => {
        const { id } = await coordinator.create(ALICE, save('Old'));
        const swapped = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'];

        const dto = await coordinator.update(ALICE, id as DeckId, save('New', swapped));

        expect(dto).toMatchObject({ id, name: 'New', characterIds: swapped });
    });

    it("answers 404 for another user's deck, without touching it", async () => {
        const { id } = await coordinator.create(BOB, save('Bob deck'));
        await expect(coordinator.update(ALICE, id as DeckId, save('Hijack'))).rejects.toBeInstanceOf(NotFoundException);
        expect(decks.decks[0].name).toBe('Bob deck');
    });

    it('answers 404 for a missing deck', async () => {
        await expect(coordinator.update(ALICE, 'nope' as DeckId, save('X'))).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an invalid composition', async () => {
        const { id } = await coordinator.create(ALICE, save('Ok'));
        await expect(coordinator.update(ALICE, id as DeckId, save('Ok', ['c0']))).rejects.toBeInstanceOf(BadRequestException);
    });
});

describe('delete', () => {
    it('deletes a deck when another one remains', async () => {
        const { id } = await coordinator.create(ALICE, save('A'));
        await coordinator.create(ALICE, save('B'));
        await coordinator.delete(ALICE, id as DeckId);
        expect((await coordinator.list(ALICE)).decks.map(d => d.name)).toEqual(['B']);
    });

    it('refuses to delete the last deck', async () => {
        const { id } = await coordinator.create(ALICE, save('Only'));
        await expect(coordinator.delete(ALICE, id as DeckId)).rejects.toBeInstanceOf(ConflictException);
        expect(await decks.countByUser(ALICE)).toBe(1);
    });

    it("answers 404 for another user's deck", async () => {
        const { id } = await coordinator.create(BOB, save('Bob deck'));
        await coordinator.create(BOB, save('Bob deck 2'));
        await expect(coordinator.delete(ALICE, id as DeckId)).rejects.toBeInstanceOf(NotFoundException);
        expect(await decks.countByUser(BOB)).toBe(2);
    });
});

describe('getOwnDeckCharacterIds', () => {
    it("returns the deck's characters for its owner", async () => {
        const { id } = await coordinator.create(ALICE, save('Mine'));
        await expect(coordinator.getOwnDeckCharacterIds(ALICE, id as DeckId)).resolves.toEqual(SIX);
    });

    it("answers 404 for someone else's deck", async () => {
        const { id } = await coordinator.create(BOB, save('Bob deck'));
        await expect(coordinator.getOwnDeckCharacterIds(ALICE, id as DeckId)).rejects.toBeInstanceOf(NotFoundException);
    });
});

describe('ensureStarterDeck', () => {
    it('creates a starter deck from the first 6 catalog ids, sorted', async () => {
        await coordinator.ensureStarterDeck(ALICE);
        const { decks: list } = await coordinator.list(ALICE);
        expect(list).toHaveLength(1);
        expect(list[0].characterIds).toEqual(SIX);
    });

    it('does nothing when the user already has a deck', async () => {
        await coordinator.create(ALICE, save('Mine'));
        await coordinator.ensureStarterDeck(ALICE);
        expect(await decks.countByUser(ALICE)).toBe(1);
    });
});

describe('bounds', () => {
    it('accepts a 30-character name, counted after trimming', async () => {
        const name = 'x'.repeat(30);
        await expect(coordinator.create(ALICE, save(`  ${name}  `))).resolves.toEqual(expect.objectContaining({ name }));
    });

    it('builds the starter deck from the 6 smallest ids whatever order the catalog lists them in', async () => {
        const catalog = makeTestCatalog(8);
        const reversed = { ...catalog, ids: () => [...catalog.ids()].reverse() };
        const starter = new DeckCoordinatorService(decks, reversed, collection as unknown as CollectionCoordinatorService);

        await starter.ensureStarterDeck(ALICE);

        expect(decks.decks[0].characterIds).toEqual(SIX);
    });
});
