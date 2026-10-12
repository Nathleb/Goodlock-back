import { Test } from '@nestjs/testing';
import { CollectionModule } from '@infrastructure/collection.module';
import { PrismaModule } from '@infrastructure/prisma/prisma.module';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { CollectionCoordinatorService } from '@application/services/CollectionCoordinator.service';
import { UserId } from '@shared/branded.types';

describe('CollectionModule', () => {
    it('wires the coordinator to the real catalog and the Prisma repository', async () => {
        const prisma = { userCharacter: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn() } };
        const module = await Test.createTestingModule({ imports: [PrismaModule, CollectionModule] })
            .overrideProvider(PrismaService).useValue(prisma)
            .compile();
        await module.init();

        const coordinator = module.get(CollectionCoordinatorService);
        await coordinator.grantAll('u1' as UserId);

        const written = prisma.userCharacter.createMany.mock.calls[0][0].data;
        expect(written).toHaveLength(10);
        expect(written[0]).toEqual({ userId: 'u1', characterId: expect.any(String) });

        await module.close();
    });
});
