type EnvLike = { JWT_ACCESS_SECRET?: string; JWT_ACCESS_EXPIRES_IN?: string };

export type JwtAccessConfig = { secret: string; expiresIn: string };

const MIN_SECRET_LENGTH = 32;
// jsonwebtoken accepts plain seconds ("3600") or an ms-style duration ("15m", "7d")
const DURATION_PATTERN = /^\d+(ms|s|m|h|d|w|y)?$/;

export function jwtConfigFromEnv(env: EnvLike): JwtAccessConfig {
    const secret = env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
        throw new Error(
            `JWT_ACCESS_SECRET must be set to at least ${MIN_SECRET_LENGTH} characters (e.g. \`openssl rand -hex 32\`)`,
        );
    }
    const expiresIn = env.JWT_ACCESS_EXPIRES_IN;
    if (!expiresIn || !DURATION_PATTERN.test(expiresIn)) {
        throw new Error(
            `JWT_ACCESS_EXPIRES_IN must be a duration like "900", "15m" or "7d", got: ${expiresIn}`,
        );
    }
    return { secret, expiresIn };
}
