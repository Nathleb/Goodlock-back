import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

/**
 * Answers a failed gateway handler (invalid payload, unexpected throw) with the same
 * `'error' { message }` event the coordinators emit. Only WsException messages reach the client:
 * anything else is reported generically so internals do not leak.
 */
@Catch()
export class WsErrorFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost): void {
        const client = host.switchToWs().getClient<Socket>();
        client.emit('error', { message: this.messageOf(exception) });
    }

    private messageOf(exception: unknown): string {
        if (!(exception instanceof WsException)) return 'Internal error';
        const error = exception.getError();
        return typeof error === 'string' ? error : String((error as { message?: unknown }).message ?? 'Invalid request');
    }
}
