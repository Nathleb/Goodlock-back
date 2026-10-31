import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

/**
 * Answers a failed gateway handler (invalid payload, unexpected throw) with the same
 * `'error' { message }` event the coordinators emit. Only WsException messages reach the client:
 * anything else is logged here and reported generically, so internals do not leak and a server
 * bug still leaves a trace.
 */
@Catch()
export class WsErrorFilter implements ExceptionFilter {
    private readonly logger = new Logger(WsErrorFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const client = host.switchToWs().getClient<Socket>();
        client.emit('error', { message: this.messageOf(exception) });
    }

    private messageOf(exception: unknown): string {
        if (!(exception instanceof WsException)) {
            this.logger.error(exception);
            return 'Internal error';
        }
        const error = exception.getError();
        if (typeof error === 'string') return error;
        const message = (error as { message?: unknown }).message;
        return typeof message === 'string' ? message : 'Invalid request';
    }
}
