import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ErrorCode, ErrorPayload } from '@application/dtos/Error.dto';
import { toErrorPayload } from '@application/errors/toErrorPayload';

// The codes the gateway itself raises (a WsException may carry one of these, anything else is a plain bad request).
const GATEWAY_CODES: readonly ErrorCode[] = ['INVALID_REQUEST', 'NOT_CONNECTED'];

/**
 * Answers a failed gateway handler with the `error { code, message }` event the coordinators emit.
 * A WsException is a request the gateway refused (bad payload, no session); a DomainError that
 * reached it keeps its code; anything else is a bug: it is logged and the client only sees INTERNAL.
 */
@Catch()
export class WsErrorFilter implements ExceptionFilter {
    private readonly logger = new Logger(WsErrorFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const client = host.switchToWs().getClient<Socket>();
        const payload = exception instanceof WsException
            ? this.refusal(exception)
            : toErrorPayload(exception, this.logger);
        client.emit('error', payload);
    }

    private refusal(exception: WsException): ErrorPayload {
        const error = exception.getError();
        if (typeof error === 'string') return { code: 'INVALID_REQUEST', message: error };
        const { code, message } = error as { code?: unknown; message?: unknown };
        return {
            code: GATEWAY_CODES.includes(code as ErrorCode) ? (code as ErrorCode) : 'INVALID_REQUEST',
            message: typeof message === 'string' ? message : 'Invalid request',
        };
    }
}
