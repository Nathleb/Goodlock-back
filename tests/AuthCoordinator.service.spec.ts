import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException, NotFoundException, Logger } from '@nestjs/common';
import { AuthCoordinatorService } from '@application/services/AuthCoordinator.service';
import { CollectionCoordinatorService } from '@application/services/CollectionCoordinator.service';
import { DeckCoordinatorService } from '@application/services/DeckCoordinator.service';
import { UserPort } from '@application/ports/UserPort';
import { RefreshTokenPort } from '@application/ports/RefreshTokenPort';
import { UserId } from '@shared/branded.types';
import User from '@domain/types/User.type';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

jest.mock('bcrypt', () => ({
    hash: jest.fn(),
    compare: jest.fn(),
}));

const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

const USER_ID = 'user-uuid-1' as UserId;
const MOCK_USER: User = {
    id: USER_ID,
    username: 'testuser',
    passwordHash: 'hashed-password',
    createdAt: new Date('2026-01-01'),
};

const mockUserPort: jest.Mocked<UserPort> = {
    findByUsername: jest.fn(),
    findById: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
};

const mockRefreshTokenPort: jest.Mocked<RefreshTokenPort> = {
    save: jest.fn(),
    findByHash: jest.fn(),
    revokeByHash: jest.fn(),
    deleteByHash: jest.fn(),
    deleteAllForUser: jest.fn(),
};

const mockDecks = {
    ensureStarterDeck: jest.fn(),
};

const mockCollection = {
    grantAll: jest.fn(),
};

const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('signed-access-token'),
};

let service: AuthCoordinatorService;

beforeEach(() => {
    jest.clearAllMocks();
    mockBcrypt.hash.mockResolvedValue('hashed' as never);
    mockBcrypt.compare.mockResolvedValue(true as never);
    mockRefreshTokenPort.save.mockResolvedValue(undefined);
    mockCollection.grantAll.mockResolvedValue(undefined);
    mockDecks.ensureStarterDeck.mockResolvedValue(undefined);
    service = new AuthCoordinatorService(
        mockUserPort,
        mockRefreshTokenPort,
        mockJwtService as unknown as JwtService,
        mockCollection as unknown as CollectionCoordinatorService,
        mockDecks as unknown as DeckCoordinatorService,
    );
});

describe('register', () => {
    it('saves a new user and returns token pair', async () => {
        mockUserPort.findByUsername.mockResolvedValue(undefined);
        mockUserPort.save.mockResolvedValue(undefined);

        const result = await service.register({ username: 'newuser', password: 'password123' });

        expect(mockUserPort.findByUsername).toHaveBeenCalledWith('newuser');
        expect(mockBcrypt.hash).toHaveBeenCalledWith('password123', 12);
        expect(mockUserPort.save).toHaveBeenCalledTimes(1);
        expect(result.accessToken).toBe('signed-access-token');
        expect(typeof result.refreshToken).toBe('string');
        expect(result.refreshToken.length).toBeGreaterThan(0);
    });

    it('throws ConflictException when username is taken', async () => {
        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);

        await expect(service.register({ username: 'testuser', password: 'password123' }))
            .rejects.toThrow(ConflictException);

        expect(mockUserPort.save).not.toHaveBeenCalled();
    });
});

describe('login', () => {
    it('returns token pair on valid credentials', async () => {
        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);
        mockBcrypt.compare.mockResolvedValue(true as never);

        const result = await service.login({ username: 'testuser', password: 'correct-password' });

        expect(result.accessToken).toBe('signed-access-token');
        expect(typeof result.refreshToken).toBe('string');
    });

    it('throws generic UnauthorizedException when username does not exist', async () => {
        mockUserPort.findByUsername.mockResolvedValue(undefined);

        await expect(service.login({ username: 'ghost', password: 'any' }))
            .rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('throws generic UnauthorizedException when password is wrong', async () => {
        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);
        mockBcrypt.compare.mockResolvedValue(false as never);

        await expect(service.login({ username: 'testuser', password: 'wrong' }))
            .rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('returns the same error message for wrong username and wrong password', async () => {
        mockUserPort.findByUsername.mockResolvedValue(undefined);
        let errorMessage = '';
        try { await service.login({ username: 'ghost', password: 'any' }); }
        catch (e: unknown) { errorMessage = (e as Error).message; }

        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);
        mockBcrypt.compare.mockResolvedValue(false as never);
        let errorMessage2 = '';
        try { await service.login({ username: 'testuser', password: 'wrong' }); }
        catch (e: unknown) { errorMessage2 = (e as Error).message; }

        expect(errorMessage).toBe(errorMessage2);
    });
});

describe('refresh', () => {
    const RAW_TOKEN = 'raw-refresh-token-string';
    const TOKEN_HASH = createHash('sha256').update(RAW_TOKEN).digest('hex');

    it('rotates token and returns new pair when token is valid', async () => {
        mockRefreshTokenPort.findByHash.mockResolvedValue({
            userId: USER_ID,
            expiresAt: new Date(Date.now() + 60_000),
            isRevoked: false,
        });
        mockRefreshTokenPort.revokeByHash.mockResolvedValue(undefined);
        mockUserPort.findById.mockResolvedValue(MOCK_USER);

        const result = await service.refresh({ refreshToken: RAW_TOKEN });

        expect(mockRefreshTokenPort.findByHash).toHaveBeenCalledWith(TOKEN_HASH);
        expect(mockRefreshTokenPort.revokeByHash).toHaveBeenCalledWith(TOKEN_HASH);
        expect(result.accessToken).toBe('signed-access-token');
        expect(typeof result.refreshToken).toBe('string');
    });

    it('throws UnauthorizedException when token is not found', async () => {
        mockRefreshTokenPort.findByHash.mockResolvedValue(undefined);

        await expect(service.refresh({ refreshToken: RAW_TOKEN }))
            .rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when token is expired', async () => {
        mockRefreshTokenPort.findByHash.mockResolvedValue({
            userId: USER_ID,
            expiresAt: new Date(Date.now() - 60_000),
            isRevoked: false,
        });

        await expect(service.refresh({ refreshToken: RAW_TOKEN }))
            .rejects.toThrow(UnauthorizedException);

        expect(mockRefreshTokenPort.deleteByHash).toHaveBeenCalledWith(TOKEN_HASH);
    });

    it('wipes all sessions and throws when a revoked token is reused (compromise)', async () => {
        mockRefreshTokenPort.findByHash.mockResolvedValue({
            userId: USER_ID,
            expiresAt: new Date(Date.now() + 60_000),
            isRevoked: true,
        });
        mockRefreshTokenPort.deleteAllForUser.mockResolvedValue(undefined);

        await expect(service.refresh({ refreshToken: RAW_TOKEN }))
            .rejects.toThrow(UnauthorizedException);

        expect(mockRefreshTokenPort.deleteAllForUser).toHaveBeenCalledWith(USER_ID);
    });
});

describe('logout', () => {
    it('deletes the refresh token', async () => {
        const RAW_TOKEN = 'logout-token';
        const HASH = createHash('sha256').update(RAW_TOKEN).digest('hex');
        mockRefreshTokenPort.deleteByHash.mockResolvedValue(undefined);

        await service.logout({ refreshToken: RAW_TOKEN });

        expect(mockRefreshTokenPort.deleteByHash).toHaveBeenCalledWith(HASH);
    });
});

describe('getMe', () => {
    it('returns user profile without passwordHash', async () => {
        mockUserPort.findById.mockResolvedValue(MOCK_USER);

        const result = await service.getMe(USER_ID);

        expect(result.id).toBe(USER_ID);
        expect(result.username).toBe('testuser');
        expect(result.createdAt).toEqual(new Date('2026-01-01'));
        expect('passwordHash' in result).toBe(false);
    });

    it('throws NotFoundException when user does not exist', async () => {
        mockUserPort.findById.mockResolvedValue(undefined);

        await expect(service.getMe(USER_ID)).rejects.toThrow(NotFoundException);
    });
});

describe('deleteAccount', () => {
    it('deletes all refresh tokens then the user', async () => {
        mockRefreshTokenPort.deleteAllForUser.mockResolvedValue(undefined);
        mockUserPort.delete.mockResolvedValue(undefined);

        await service.deleteAccount(USER_ID);

        expect(mockRefreshTokenPort.deleteAllForUser).toHaveBeenCalledWith(USER_ID);
        expect(mockUserPort.delete).toHaveBeenCalledWith(USER_ID);
    });
});

describe('collection grant (temporary grant-all)', () => {
    afterEach(() => jest.restoreAllMocks());

    it('register grants every catalog character to the new user', async () => {
        mockUserPort.findByUsername.mockResolvedValue(undefined);
        await service.register({ username: 'newuser', password: 'password123' });
        const savedUser = mockUserPort.save.mock.calls[0][0];
        expect(mockCollection.grantAll).toHaveBeenCalledWith(savedUser.id);
    });

    it('login grants every catalog character (self-heals older accounts)', async () => {
        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);
        await service.login({ username: 'testuser', password: 'password123' });
        expect(mockCollection.grantAll).toHaveBeenCalledWith(USER_ID);
    });

    it('does not grant when registration is refused', async () => {
        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);
        await expect(service.register({ username: 'testuser', password: 'password123' })).rejects.toThrow(ConflictException);
        expect(mockCollection.grantAll).not.toHaveBeenCalled();
    });

    it('does not grant on a failed login', async () => {
        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);
        mockBcrypt.compare.mockResolvedValue(false as never);
        await expect(service.login({ username: 'testuser', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
        expect(mockCollection.grantAll).not.toHaveBeenCalled();
    });

    it('register still returns tokens when the grant fails, and logs it', async () => {
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        mockUserPort.findByUsername.mockResolvedValue(undefined);
        mockCollection.grantAll.mockRejectedValue(new Error('db hiccup'));
        const result = await service.register({ username: 'newuser', password: 'password123' });
        expect(result.accessToken).toBe('signed-access-token');
        expect(error).toHaveBeenCalledWith(expect.stringContaining('db hiccup'));
    });

    it('login still returns tokens when the grant fails', async () => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation();
        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);
        mockCollection.grantAll.mockRejectedValue(new Error('db hiccup'));
        const result = await service.login({ username: 'testuser', password: 'password123' });
        expect(result.accessToken).toBe('signed-access-token');
    });
});

describe('starter deck (temporary)', () => {
    afterEach(() => jest.restoreAllMocks());

    it('register creates the starter deck after granting the collection', async () => {
        mockUserPort.findByUsername.mockResolvedValue(undefined);
        await service.register({ username: 'newuser', password: 'password123' });
        const savedUser = mockUserPort.save.mock.calls[0][0];
        expect(mockDecks.ensureStarterDeck).toHaveBeenCalledWith(savedUser.id);
        expect(mockCollection.grantAll.mock.invocationCallOrder[0])
            .toBeLessThan(mockDecks.ensureStarterDeck.mock.invocationCallOrder[0]);
    });

    it('login ensures the starter deck (self-heals accounts without one)', async () => {
        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);
        await service.login({ username: 'testuser', password: 'password123' });
        expect(mockDecks.ensureStarterDeck).toHaveBeenCalledWith(USER_ID);
    });

    it('skips the deck when the grant failed (it would not be owned)', async () => {
        jest.spyOn(Logger.prototype, 'error').mockImplementation();
        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);
        mockCollection.grantAll.mockRejectedValue(new Error('db hiccup'));
        await service.login({ username: 'testuser', password: 'password123' });
        expect(mockDecks.ensureStarterDeck).not.toHaveBeenCalled();
    });

    it('still returns tokens when the starter deck fails, and logs it', async () => {
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
        mockUserPort.findByUsername.mockResolvedValue(undefined);
        mockDecks.ensureStarterDeck.mockRejectedValue(new Error('deck hiccup'));
        const result = await service.register({ username: 'newuser', password: 'password123' });
        expect(result.accessToken).toBe('signed-access-token');
        expect(error).toHaveBeenCalledWith(expect.stringContaining('deck hiccup'));
    });
});

describe('what is stored and signed', () => {
    const NOW = new Date('2026-11-01T12:00:00Z').getTime();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const sha256 = (raw: string) => createHash('sha256').update(raw).digest('hex');

    beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
    afterEach(() => jest.restoreAllMocks());

    it('saves the bcrypt hash of the password, never the password itself', async () => {
        mockUserPort.findByUsername.mockResolvedValue(undefined);

        await service.register({ username: 'newuser', password: 'password123' });

        const saved = mockUserPort.save.mock.calls[0][0];
        expect(saved).toEqual(expect.objectContaining({ username: 'newuser', passwordHash: 'hashed' }));
        expect(JSON.stringify(saved)).not.toContain('password123');
    });

    it('stores only the SHA-256 of the returned refresh token, valid for 7 days', async () => {
        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);

        const { refreshToken } = await service.login({ username: 'testuser', password: 'password123' });

        expect(mockRefreshTokenPort.save).toHaveBeenCalledWith(sha256(refreshToken), USER_ID, new Date(NOW + SEVEN_DAYS_MS));
    });

    it('signs the access token for the user id and username', async () => {
        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);

        await service.login({ username: 'testuser', password: 'password123' });

        expect(mockJwtService.signAsync).toHaveBeenCalledWith({ sub: USER_ID, username: 'testuser' });
    });

    it('issues a different refresh token on each login', async () => {
        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);

        const first = await service.login({ username: 'testuser', password: 'password123' });
        const second = await service.login({ username: 'testuser', password: 'password123' });

        expect(first.refreshToken).not.toBe(second.refreshToken);
    });

    it('refuses to refresh for a user deleted since, and issues nothing', async () => {
        mockRefreshTokenPort.findByHash.mockResolvedValue({ userId: USER_ID, expiresAt: new Date(NOW + 60_000), isRevoked: false });
        mockUserPort.findById.mockResolvedValue(undefined);

        await expect(service.refresh({ refreshToken: 'raw' })).rejects.toThrow(UnauthorizedException);
        expect(mockJwtService.signAsync).not.toHaveBeenCalled();
        expect(mockRefreshTokenPort.save).not.toHaveBeenCalled();
    });
});
