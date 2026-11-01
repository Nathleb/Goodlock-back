import { DeckRepository } from '@infrastructure/adapters/repositories/DeckRepository';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { CatalogId, DeckId, UserId } from '@shared/branded.types';

const IDS = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'] as CatalogId[];
const DATE = new Date('2026-11-01T10:00:00Z');
const row = (characterIds: string[]) => ({
    id: 'd1', userId: 'alice', name: 'Aggro', createdAt: DATE, updatedAt: DATE,
    slots: characterIds.map((characterId, position) => ({ id: `s${position}`, deckId: 'd1', position, characterId })),
});
const ORDERED_SLOTS = { slots: { orderBy: { position: 'asc' } } };

function setUp() {
    const calls: string[] = [];
    const tx = {
        deckSlot: { deleteMany: jest.fn(async () => { calls.push('deleteSlots'); }) },
        deck: { update: jest.fn(async () => { calls.push('updateDeck'); return row(IDS); }) },
    };
    const prisma = {
        $transaction: jest.fn(async (work: (t: typeof tx) => Promise<unknown>) => work(tx)),
        deck: { create: jest.fn(async () => row(IDS)), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), count: jest.fn(), delete: jest.fn() },
        deckSlot: { deleteMany: jest.fn() },
    };
    return { repo: new DeckRepository(prisma as unknown as PrismaService), prisma, tx, calls };
}

describe('DeckRepository', () => {
    it('update replaces the slots and the name in one transaction, old slots first', async () => {
        const { repo, prisma, tx, calls } = setUp();

        await repo.update('d1' as DeckId, { name: 'Control', characterIds: IDS });

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(calls).toEqual(['deleteSlots', 'updateDeck']);
        expect(tx.deckSlot.deleteMany).toHaveBeenCalledWith({ where: { deckId: 'd1' } });
        expect(tx.deck.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'd1' },
            data: { name: 'Control', slots: { create: IDS.map((characterId, position) => ({ position, characterId })) } },
        }));
        expect(prisma.deck.update).not.toHaveBeenCalled();
        expect(prisma.deckSlot.deleteMany).not.toHaveBeenCalled();
    });

    it('create stores each character at its deck position', async () => {
        const { repo, prisma } = setUp();

        await repo.create('alice' as UserId, { name: 'Aggro', characterIds: IDS });

        expect(prisma.deck.create).toHaveBeenCalledWith({
            data: { userId: 'alice', name: 'Aggro', slots: { create: IDS.map((characterId, position) => ({ position, characterId })) } },
            include: ORDERED_SLOTS,
        });
    });

    it('reads decks with their slots ordered by position, as characterIds in that order', async () => {
        const { repo, prisma } = setUp();
        prisma.deck.findUnique.mockResolvedValue(row(['c5', 'c4', 'c3', 'c2', 'c1', 'c0']));

        const deck = await repo.findById('d1' as DeckId);

        expect(prisma.deck.findUnique).toHaveBeenCalledWith({ where: { id: 'd1' }, include: ORDERED_SLOTS });
        expect(deck).toEqual({ id: 'd1', userId: 'alice', name: 'Aggro', characterIds: ['c5', 'c4', 'c3', 'c2', 'c1', 'c0'], createdAt: DATE, updatedAt: DATE });
    });

    it('answers undefined for a deck that does not exist', async () => {
        const { repo, prisma } = setUp();
        prisma.deck.findUnique.mockResolvedValue(null);

        await expect(repo.findById('nope' as DeckId)).resolves.toBeUndefined();
    });

    it("lists a user's decks oldest first, slots ordered", async () => {
        const { repo, prisma } = setUp();
        prisma.deck.findMany.mockResolvedValue([row(IDS)]);

        await repo.listByUser('alice' as UserId);

        expect(prisma.deck.findMany).toHaveBeenCalledWith({ where: { userId: 'alice' }, include: ORDERED_SLOTS, orderBy: { createdAt: 'asc' } });
    });
});
