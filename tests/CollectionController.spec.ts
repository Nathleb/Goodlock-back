import { Test } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CollectionController } from '@infrastructure/adapters/http/CollectionController';
import { JwtAccessGuard } from '@infrastructure/adapters/websocket/guards/JwtAccess.guard';
import { CollectionCoordinatorService } from '@application/services/CollectionCoordinator.service';
import { CollectionDTO } from '@application/dtos/Collection.dto';

class AllowAllGuard { canActivate(_ctx: ExecutionContext) { return true; } }

const mockCoordinator = { getCollection: jest.fn() };
const request = (sub: string) => ({ user: { sub, username: 'u' } }) as never;

let controller: CollectionController;

beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
        controllers: [CollectionController],
        providers: [
            { provide: CollectionCoordinatorService, useValue: mockCoordinator },
            { provide: APP_GUARD, useClass: AllowAllGuard },
        ],
    }).overrideGuard(JwtAccessGuard).useClass(AllowAllGuard).compile();
    controller = module.get(CollectionController);
});

describe('GET /collection', () => {
    it("returns the authenticated user's collection", async () => {
        const dto: CollectionDTO = { characters: [{ id: 'alicent', name: 'Alicent', maxHp: 10, baseSpeed: 18, baseDie: [], acquiredAt: '2026-10-12T10:00:00.000Z' }] };
        mockCoordinator.getCollection.mockResolvedValue(dto);

        await expect(controller.getCollection(request('user-1'))).resolves.toEqual(dto);
        expect(mockCoordinator.getCollection).toHaveBeenCalledWith('user-1');
    });

    it('returns an empty list when the user owns nothing', async () => {
        mockCoordinator.getCollection.mockResolvedValue({ characters: [] });
        await expect(controller.getCollection(request('user-2'))).resolves.toEqual({ characters: [] });
    });

    it('is protected by JwtAccessGuard', () => {
        const guards = Reflect.getMetadata('__guards__', CollectionController);
        expect(guards).toContain(JwtAccessGuard);
    });
});
