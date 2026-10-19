import { Test } from '@nestjs/testing';
import { BadRequestException, ExecutionContext, HttpStatus, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DeckController } from '@infrastructure/adapters/http/DeckController';
import { JwtAccessGuard } from '@infrastructure/adapters/websocket/guards/JwtAccess.guard';
import { DeckCoordinatorService } from '@application/services/DeckCoordinator.service';
import { DeckDTO, SaveDeckDto } from '@application/dtos/Deck.dto';

class AllowAllGuard { canActivate(_ctx: ExecutionContext) { return true; } }

const mockCoordinator = { list: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
const request = (sub: string) => ({ user: { sub, username: 'u' } }) as never;
const body = { name: 'Aggro', characterIds: ['a', 'b', 'c', 'd', 'e', 'f'] };
const DECK: DeckDTO = { id: 'd1', ...body, createdAt: '2026-10-12T10:00:00.000Z', updatedAt: '2026-10-12T10:00:00.000Z' };

let controller: DeckController;

beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
        controllers: [DeckController],
        providers: [
            { provide: DeckCoordinatorService, useValue: mockCoordinator },
            { provide: APP_GUARD, useClass: AllowAllGuard },
        ],
    }).overrideGuard(JwtAccessGuard).useClass(AllowAllGuard).compile();
    controller = module.get(DeckController);
});

const httpCode = (method: keyof DeckController) =>
    Reflect.getMetadata('__httpCode__', DeckController.prototype[method]);

it('is protected by JwtAccessGuard', () => {
    expect(Reflect.getMetadata('__guards__', DeckController)).toContain(JwtAccessGuard);
});

it("GET /decks lists the caller's decks", async () => {
    mockCoordinator.list.mockResolvedValue({ decks: [DECK] });
    await expect(controller.list(request('user-1'))).resolves.toEqual({ decks: [DECK] });
    expect(mockCoordinator.list).toHaveBeenCalledWith('user-1');
});

it('POST /decks creates a deck for the caller (201)', async () => {
    mockCoordinator.create.mockResolvedValue(DECK);
    await expect(controller.create(request('user-1'), body)).resolves.toEqual(DECK);
    expect(mockCoordinator.create).toHaveBeenCalledWith('user-1', body);
    expect(httpCode('create')).toBe(HttpStatus.CREATED);
});

it('PUT /decks/:id updates the given deck for the caller', async () => {
    mockCoordinator.update.mockResolvedValue(DECK);
    await expect(controller.update(request('user-1'), 'd1', body)).resolves.toEqual(DECK);
    expect(mockCoordinator.update).toHaveBeenCalledWith('user-1', 'd1', body);
});

it('DELETE /decks/:id deletes the given deck for the caller (204)', async () => {
    mockCoordinator.delete.mockResolvedValue(undefined);
    await controller.delete(request('user-1'), 'd1');
    expect(mockCoordinator.delete).toHaveBeenCalledWith('user-1', 'd1');
    expect(httpCode('delete')).toBe(HttpStatus.NO_CONTENT);
});

describe('SaveDeckDto through the global ValidationPipe', () => {
    // Same options as main.ts
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
    const validate = (value: unknown) => pipe.transform(value, { type: 'body', metatype: SaveDeckDto });

    it('accepts a well-formed body', async () => {
        await expect(validate(body)).resolves.toBeDefined();
    });

    it.each([
        ['5 ids', { ...body, characterIds: body.characterIds.slice(0, 5) }],
        ['7 ids', { ...body, characterIds: [...body.characterIds, 'g'] }],
        ['non-string id', { ...body, characterIds: [1, 2, 3, 4, 5, 6] }],
        ['missing name', { characterIds: body.characterIds }],
        ['unknown field', { ...body, userId: 'someone-else' }],
    ])('rejects %s', async (_label, value) => {
        await expect(validate(value)).rejects.toBeInstanceOf(BadRequestException);
    });
});
