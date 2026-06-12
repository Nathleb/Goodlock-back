import { jwtConfigFromEnv } from '@infrastructure/config/jwt.config';

const VALID_SECRET = 'a'.repeat(64);

describe('jwtConfigFromEnv', () => {
    it('parses a valid configuration', () => {
        expect(
            jwtConfigFromEnv({ JWT_ACCESS_SECRET: VALID_SECRET, JWT_ACCESS_EXPIRES_IN: '15m' }),
        ).toEqual({ secret: VALID_SECRET, expiresIn: '15m' });
    });

    it('accepts plain-second and unit duration formats', () => {
        expect(
            jwtConfigFromEnv({ JWT_ACCESS_SECRET: VALID_SECRET, JWT_ACCESS_EXPIRES_IN: '3600' }).expiresIn,
        ).toBe('3600');
        expect(
            jwtConfigFromEnv({ JWT_ACCESS_SECRET: VALID_SECRET, JWT_ACCESS_EXPIRES_IN: '7d' }).expiresIn,
        ).toBe('7d');
    });

    it('fails fast when the secret is missing or too short', () => {
        expect(() => jwtConfigFromEnv({ JWT_ACCESS_EXPIRES_IN: '15m' })).toThrow(/JWT_ACCESS_SECRET/);
        expect(() =>
            jwtConfigFromEnv({ JWT_ACCESS_SECRET: 'short', JWT_ACCESS_EXPIRES_IN: '15m' }),
        ).toThrow(/JWT_ACCESS_SECRET/);
    });

    it('fails fast when expiresIn is missing or malformed', () => {
        expect(() => jwtConfigFromEnv({ JWT_ACCESS_SECRET: VALID_SECRET })).toThrow(
            /JWT_ACCESS_EXPIRES_IN/,
        );
        expect(() =>
            jwtConfigFromEnv({ JWT_ACCESS_SECRET: VALID_SECRET, JWT_ACCESS_EXPIRES_IN: 'soon' }),
        ).toThrow(/JWT_ACCESS_EXPIRES_IN/);
    });
});
