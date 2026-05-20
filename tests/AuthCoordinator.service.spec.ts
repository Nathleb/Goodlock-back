import { ConflictException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { AuthCoordinatorService } from '@application/services/AuthCoordinator.service';
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

const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('signed-access-token'),
};

const mockConfigService = {
    get: (key: string) => ({
        JWT_ACCESS_SECRET: 'access-secret-test',
        JWT_REFRESH_SECRET: 'refresh-secret-test',
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
    }[key] ?? ''),
};

let service: AuthCoordinatorService;

beforeEach(() => {
    jest.clearAllMocks();
    mockBcrypt.hash.mockResolvedValue('hashed' as never);
    mockBcrypt.compare.mockResolvedValue(true as never);
    mockRefreshTokenPort.save.mockResolvedValue(undefined);
    service = new AuthCoordinatorService(
        mockUserPort,
        mockRefreshTokenPort,
        mockJwtService as any,
        mockConfigService as any,
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
        catch (e: any) { errorMessage = e.message; }

        mockUserPort.findByUsername.mockResolvedValue(MOCK_USER);
        mockBcrypt.compare.mockResolvedValue(false as never);
        let errorMessage2 = '';
        try { await service.login({ username: 'testuser', password: 'wrong' }); }
        catch (e: any) { errorMessage2 = e.message; }

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
        expect((result as any).passwordHash).toBeUndefined();
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
