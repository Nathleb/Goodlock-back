/**
 * Rules a player action can break. Anything else that goes wrong (a bug, a broken invariant, a
 * bad template at boot) is not a DomainError: it is thrown, logged, and reported as INTERNAL.
 */
export const DOMAIN_ERROR_CODES = [
    'ROOM_NOT_FOUND',
    'ROOM_FULL',
    'GAME_ALREADY_STARTED',
    'ROOM_NOT_READY',
    'NOT_IN_ROOM',
    'NOT_ROOM_OWNER',
    'DECKS_NOT_CHOSEN',
    'WRONG_PHASE',
    'ALREADY_CONFIRMED',
    'NO_ROLLS_LEFT',
    'NO_SELECTION',
    'INVALID_SELECTION',
    'INVALID_PLACEMENT',
    'ACTION_NOT_AVAILABLE',
    'CLAIM_NOT_ALLOWED',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export type DomainError = {
    readonly code: DomainErrorCode;
    readonly message: string;
};

export function domainError(code: DomainErrorCode, message: string): DomainError {
    return Object.freeze({ code, message });
}

export function isDomainError(value: unknown): value is DomainError {
    if (typeof value !== 'object' || value === null || value instanceof Error) return false;
    const { code, message } = value as { code?: unknown; message?: unknown };
    return typeof message === 'string' && (DOMAIN_ERROR_CODES as readonly unknown[]).includes(code);
}
