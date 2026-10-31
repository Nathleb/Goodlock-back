import { Result } from '@shared/result.type';

/** The value of an ok; an err fails the test with the error in the message. */
export function unwrap<T, E>(result: Result<T, E>): T {
    if (result.isErr()) throw new Error(`Expected Ok, got Err: ${JSON.stringify(result.error)}`);
    return result.value;
}

/** The error of an err; an ok fails the test with the value in the message. */
export function unwrapErr<T, E>(result: Result<T, E>): E {
    if (result.isOk()) throw new Error(`Expected Err, got Ok: ${JSON.stringify(result.value)}`);
    return result.error;
}
