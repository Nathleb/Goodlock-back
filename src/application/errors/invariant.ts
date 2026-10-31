import { DomainError } from '@domain/errors/DomainError';
import { Result } from '@shared/result.type';

/**
 * For a step the caller has just set up itself (it moved the game to the phase the step needs):
 * a failure there is a bug, not something the player did. It is thrown as a plain Error, so it
 * is logged and reported as INTERNAL rather than as a rule the player broke.
 */
export function invariant<T>(result: Result<T, DomainError>): T {
    if (result.isErr()) throw new Error(`Broken invariant (${result.error.code}): ${result.error.message}`);
    return result.value;
}
