import { DomainErrorCode } from '@domain/errors/DomainError';

/** Every code a client can receive in an `error` event. */
export type ErrorCode = DomainErrorCode | 'INVALID_REQUEST' | 'NOT_CONNECTED' | 'INTERNAL';

export type ErrorPayload = {
    readonly code: ErrorCode;
    readonly message: string;
};
