import { isDomainError } from '@domain/errors/DomainError';
import { ErrorPayload } from '@application/dtos/Error.dto';

/**
 * What the client is told about a failure. A DomainError is a rule the player broke: its code and
 * message are sent as they are. Anything else was thrown, so it is a bug or a broken invariant:
 * it is logged here and the client only learns that something went wrong on the server.
 */
export function toErrorPayload(error: unknown, logger: { error(message: unknown): void }): ErrorPayload {
    if (isDomainError(error)) return { code: error.code, message: error.message };
    logger.error(error);
    return { code: 'INTERNAL', message: 'Internal error' };
}
