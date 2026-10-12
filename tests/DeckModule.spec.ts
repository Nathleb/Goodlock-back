import { Test } from '@nestjs/testing';
import { DeckModule } from '@infrastructure/deck.module';
import { PrismaModule } from '@infrastructure/prisma/prisma.module';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { DeckCoordinatorService } from '@application/services/DeckCoordinator.service';
import { UserId } from '@shared/branded.types';

describe('DeckModule', () => {
    it('wires the coordinator to the catalog, the collection and the Prisma repository', async () => {
        const allIds = ['alicent', 'charlie', 'diana', 'edward', 'eve', 'fiona', 'george', 'hannah', 'jason', 'robbert'];
        const prisma = {
            userCharacter: { findMany: jest.fn().mockResolvedValue(allIds.map(characterId => ({ characterId, acquiredAt: new Date() }))) },
            deck: {
                count: jest.fn().mockResolvedValue(0),
                create: jest.fn().mockImplementation(({ data }) => Promise.resolve({
                    id: 'd1', userId: data.userId, name: data.name, createdAt: new Date(), updatedAt: new Date(),
                    slots: data.slots.create.map((s: { position: number; characterId: string }) => ({ id: `s${s.position}`, deckId: 'd1', ...s })),
                })),
            },
        };
        const module = await Test.createTestingModule({ imports: [PrismaModule, DeckModule] })
            .overrideProvider(PrismaService).useValue(prisma)
            .compile();
        await module.init();

        await module.get(DeckCoordinatorService).ensureStarterDeck('u1' as UserId);

        const created = prisma.deck.create.mock.calls[0][0].data;
        expect(created.userId).toBe('u1');
        expect(created.slots.create.map((s: { characterId: string }) => s.characterId)).toEqual(allIds.slice(0, 7));

        await module.close();
    });
});
