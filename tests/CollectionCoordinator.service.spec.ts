import { Logger } from '@nestjs/common';
import { CollectionCoordinatorService } from '@application/services/CollectionCoordinator.service';
import { CollectionPort } from '@application/ports/CollectionPort';
import { CatalogId, UserId } from '@shared/branded.types';
import { makeTestCatalog } from './helpers/catalog';

const USER = 'user-1' as UserId;
const id = (s: string) => s as CatalogId;
const ACQUIRED = new Date('2026-10-12T10:00:00.000Z');

const collection: jest.Mocked<CollectionPort> = {
    listOwned: jest.fn(),
    grantMany: jest.fn(),
    listUnknownIds: jest.fn(),
};

let coordinator: CollectionCoordinatorService;

beforeEach(() => {
    jest.clearAllMocks();
    coordinator = new CollectionCoordinatorService(makeTestCatalog(3), collection);
});

afterEach(() => jest.restoreAllMocks());

describe('getCollection', () => {
    it('maps owned ids to full character DTOs', async () => {
        collection.listOwned.mockResolvedValue([{ characterId: id('c0'), acquiredAt: ACQUIRED }]);

        const { characters } = await coordinator.getCollection(USER);

        expect(collection.listOwned).toHaveBeenCalledWith(USER);
        expect(characters).toHaveLength(1);
        expect(characters[0]).toMatchObject({ id: 'c0', name: 'Name-c0', maxHp: 10, baseSpeed: 5, acquiredAt: ACQUIRED.toISOString() });
        expect(characters[0].baseDie).toHaveLength(6);
        expect(characters[0].baseDie[0]).toEqual({ description: 'noop', priority: 0, effects: [] });
    });

    it('carries each effect with its label, magnitude and target groups', async () => {
        const catalog = makeTestCatalog(0);
        const template = {
            id: id('hitter'), name: 'Hitter', maxHp: 10, baseSpeed: 5,
            baseDieInstructions: Array(6).fill({ description: 'hit', priority: 1, effects: [{ effect: 'Damage', magnitude: 3, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }] }] }),
        };
        jest.spyOn(catalog, 'get').mockReturnValue(template as never);
        coordinator = new CollectionCoordinatorService(catalog, collection);
        collection.listOwned.mockResolvedValue([{ characterId: id('hitter'), acquiredAt: ACQUIRED }]);

        const { characters } = await coordinator.getCollection(USER);

        expect(characters[0].baseDie[0].effects).toEqual([{ effect: 'Damage', magnitude: 3, targets: [{ side: 'ENEMY', mode: 'RELATIVE', n: [0] }] }]);
    });

    it('skips owned ids the catalog no longer knows', async () => {
        collection.listOwned.mockResolvedValue([
            { characterId: id('retired'), acquiredAt: ACQUIRED },
            { characterId: id('c1'), acquiredAt: ACQUIRED },
        ]);

        const { characters } = await coordinator.getCollection(USER);

        expect(characters.map(c => c.id)).toEqual(['c1']);
    });

    it('returns an empty list for an empty collection', async () => {
        collection.listOwned.mockResolvedValue([]);
        expect(await coordinator.getCollection(USER)).toEqual({ characters: [] });
    });
});

describe('ownedIds', () => {
    it('returns the set of catalog ids the user owns', async () => {
        collection.listOwned.mockResolvedValue([
            { characterId: id('c0'), acquiredAt: ACQUIRED },
            { characterId: id('c2'), acquiredAt: ACQUIRED },
        ]);
        const owned = await coordinator.ownedIds(USER);
        expect(collection.listOwned).toHaveBeenCalledWith(USER);
        expect([...owned].sort()).toEqual(['c0', 'c2']);
    });
});

describe('grant', () => {
    it('writes catalog ids', async () => {
        await coordinator.grant(USER, [id('c0'), id('c2')]);
        expect(collection.grantMany).toHaveBeenCalledWith(USER, ['c0', 'c2']);
    });

    it('rejects the whole grant when an id is not in the catalog', async () => {
        await expect(coordinator.grant(USER, [id('c0'), id('ghost')])).rejects.toThrow(/ghost/);
        expect(collection.grantMany).not.toHaveBeenCalled();
    });

    it('grantAll writes every catalog id', async () => {
        await coordinator.grantAll(USER);
        expect(collection.grantMany).toHaveBeenCalledWith(USER, ['c0', 'c1', 'c2']);
    });
});

describe('checkConsistency (boot)', () => {
    it('warns with the owned ids missing from the catalog', async () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        collection.listUnknownIds.mockResolvedValue(['retired']);

        await coordinator.onApplicationBootstrap();

        expect(collection.listUnknownIds).toHaveBeenCalledWith(['c0', 'c1', 'c2']);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('retired'));
    });

    it('stays silent when every owned id is known', async () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        collection.listUnknownIds.mockResolvedValue([]);

        await coordinator.onApplicationBootstrap();

        expect(warn).not.toHaveBeenCalled();
    });

    it('does not block boot when the check itself fails', async () => {
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        collection.listUnknownIds.mockRejectedValue(new Error('db down'));

        await expect(coordinator.onApplicationBootstrap()).resolves.toBeUndefined();
        expect(error).toHaveBeenCalledWith(expect.stringContaining('db down'));
    });
});

describe('messages listing several ids', () => {
    it('a refused grant names every unknown id', async () => {
        await expect(coordinator.grant(USER, [id('ghost'), id('wraith')])).rejects.toThrow('Unknown catalog ids: ghost, wraith');
    });

    it('the boot warning names every owned id missing from the catalog', async () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        collection.listUnknownIds.mockResolvedValue(['retired', 'gone']);

        await coordinator.onApplicationBootstrap();

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Owned characters missing from the catalog: retired, gone'));
    });
});
