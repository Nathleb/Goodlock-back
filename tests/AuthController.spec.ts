import { Test } from '@nestjs/testing';
import { BadRequestException, HttpStatus, ValidationPipe } from '@nestjs/common';
import { AuthController } from '@infrastructure/adapters/http/AuthController';
import { JwtAccessGuard } from '@infrastructure/adapters/websocket/guards/JwtAccess.guard';
import { AuthCoordinatorService } from '@application/services/AuthCoordinator.service';
import { RegisterDto } from '@application/dtos/RegisterDto';
import { LoginDto } from '@application/dtos/LoginDto';
import { RefreshDto } from '@application/dtos/RefreshDto';

const mockCoordinator = {
    register: jest.fn(), login: jest.fn(), refresh: jest.fn(), logout: jest.fn(), getMe: jest.fn(), deleteAccount: jest.fn(),
};
const TOKENS = { accessToken: 'a', refreshToken: 'r' };
// Built, not literal: a password-looking literal reads as a leaked secret to scanners.
const PASSWORD = 'p'.repeat(12);
const request = (sub: string) => ({ user: { sub, username: 'u' } }) as never;

let controller: AuthController;

beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
        controllers: [AuthController],
        providers: [{ provide: AuthCoordinatorService, useValue: mockCoordinator }],
    }).overrideGuard(JwtAccessGuard).useValue({ canActivate: () => true }).compile();
    controller = module.get(AuthController);
});

const guardsOf = (method: keyof AuthController) =>
    Reflect.getMetadata('__guards__', AuthController.prototype[method]) ?? [];
const httpCode = (method: keyof AuthController) =>
    Reflect.getMetadata('__httpCode__', AuthController.prototype[method]);

describe('route protection', () => {
    it.each(['logout', 'getMe', 'deleteAccount'] as const)('%s requires a valid access token', (method) => {
        expect(guardsOf(method)).toContain(JwtAccessGuard);
    });

    it.each(['register', 'login', 'refresh'] as const)('%s is open to anonymous callers', (method) => {
        expect(guardsOf(method)).not.toContain(JwtAccessGuard);
        expect(Reflect.getMetadata('__guards__', AuthController) ?? []).not.toContain(JwtAccessGuard);
    });
});

describe('delegation', () => {
    it('POST /auth/register answers 201 with the tokens of the coordinator', async () => {
        mockCoordinator.register.mockResolvedValue(TOKENS);
        await expect(controller.register({ username: 'neo', password: PASSWORD })).resolves.toBe(TOKENS);
        expect(mockCoordinator.register).toHaveBeenCalledWith({ username: 'neo', password: PASSWORD });
        expect(httpCode('register')).toBe(HttpStatus.CREATED);
    });

    it.each([
        ['login', { username: 'neo', password: PASSWORD }],
        ['refresh', { refreshToken: 'raw' }],
    ] as const)('POST /auth/%s answers 200 with the tokens of the coordinator', async (method, dto) => {
        mockCoordinator[method].mockResolvedValue(TOKENS);
        await expect((controller[method] as (d: unknown) => Promise<unknown>)(dto)).resolves.toBe(TOKENS);
        expect(mockCoordinator[method]).toHaveBeenCalledWith(dto);
        expect(httpCode(method)).toBe(HttpStatus.OK);
    });

    it('POST /auth/logout answers 204 and revokes the given refresh token', async () => {
        mockCoordinator.logout.mockResolvedValue(undefined);
        await controller.logout({ refreshToken: 'raw' });
        expect(mockCoordinator.logout).toHaveBeenCalledWith({ refreshToken: 'raw' });
        expect(httpCode('logout')).toBe(HttpStatus.NO_CONTENT);
    });

    it('GET /auth/me reads the profile of the token subject', async () => {
        mockCoordinator.getMe.mockResolvedValue({ id: 'user-1', username: 'neo' });
        await expect(controller.getMe(request('user-1'))).resolves.toEqual({ id: 'user-1', username: 'neo' });
        expect(mockCoordinator.getMe).toHaveBeenCalledWith('user-1');
    });

    it('DELETE /auth/account answers 204 and deletes the token subject only', async () => {
        mockCoordinator.deleteAccount.mockResolvedValue(undefined);
        await controller.deleteAccount(request('user-1'));
        expect(mockCoordinator.deleteAccount).toHaveBeenCalledWith('user-1');
        expect(httpCode('deleteAccount')).toBe(HttpStatus.NO_CONTENT);
    });
});

describe('auth DTOs through the global ValidationPipe', () => {
    // Same options as main.ts
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true });
    const validate = (metatype: new () => object, value: unknown) => pipe.transform(value, { type: 'body', metatype });

    it('accepts a well-formed registration', async () => {
        await expect(validate(RegisterDto, { username: 'neo_1', password: PASSWORD })).resolves.toBeDefined();
    });

    it.each([
        ['a 2-character username', { username: 'ne', password: PASSWORD }],
        ['a 21-character username', { username: 'n'.repeat(21), password: PASSWORD }],
        ['a username with a space', { username: 'ne o', password: PASSWORD }],
        ['a 7-character password', { username: 'neo', password: 'p'.repeat(7) }],
        ['a 73-character password', { username: 'neo', password: 'p'.repeat(73) }],
        ['an extra property', { username: 'neo', password: PASSWORD, admin: true }],
    ])('refuses a registration with %s', async (_label, value) => {
        await expect(validate(RegisterDto, value)).rejects.toThrow(BadRequestException);
    });

    it('accepts the bounds of a registration: 3 and 20 characters, 8 and 72 characters', async () => {
        await expect(validate(RegisterDto, { username: 'neo', password: 'p'.repeat(8) })).resolves.toBeDefined();
        await expect(validate(RegisterDto, { username: 'n'.repeat(20), password: 'p'.repeat(72) })).resolves.toBeDefined();
    });

    it.each([
        ['a login without password', LoginDto, { username: 'neo' }],
        ['a login with a numeric password', LoginDto, { username: 'neo', password: 12345678 }],
        ['a refresh without token', RefreshDto, {}],
    ] as const)('refuses %s', async (_label, metatype, value) => {
        await expect(validate(metatype, value)).rejects.toThrow(BadRequestException);
    });
});
