import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAccessGuard } from '@infrastructure/adapters/websocket/guards/JwtAccess.guard';

const PAYLOAD = { sub: 'user-1', username: 'neo' };
const jwt = { verifyAsync: jest.fn() };
const guard = new JwtAccessGuard(jwt as unknown as JwtService);

const contextFor = (authorization?: string) => {
    const request: { headers: { authorization?: string }; user?: unknown } = { headers: { authorization } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
    return { request, context };
};

beforeEach(() => {
    jest.clearAllMocks();
    jwt.verifyAsync.mockImplementation(async (token: string) => {
        if (token !== 'valid-token') throw new Error('invalid signature');
        return PAYLOAD;
    });
});

describe('JwtAccessGuard', () => {
    it('lets a valid bearer token through and puts its payload on the request', async () => {
        const { request, context } = contextFor('Bearer valid-token');

        await expect(guard.canActivate(context)).resolves.toBe(true);
        expect(jwt.verifyAsync).toHaveBeenCalledWith('valid-token');
        expect(request.user).toEqual(PAYLOAD);
    });

    it.each([
        ['no Authorization header', undefined],
        ['a scheme other than Bearer', 'Basic valid-token'],
        ['a lowercase scheme', 'bearer valid-token'],
    ])('refuses %s without verifying anything', async (_label, header) => {
        const { request, context } = contextFor(header);

        await expect(guard.canActivate(context)).rejects.toThrow(new UnauthorizedException('Missing token'));
        expect(jwt.verifyAsync).not.toHaveBeenCalled();
        expect(request.user).toBeUndefined();
    });

    it('refuses a token that does not verify, and leaves no user on the request', async () => {
        const { request, context } = contextFor('Bearer forged-token');

        await expect(guard.canActivate(context)).rejects.toThrow(new UnauthorizedException('Invalid or expired token'));
        expect(request.user).toBeUndefined();
    });
});
