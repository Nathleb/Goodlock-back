import { Injectable, Inject, CanActivate, ExecutionContext } from '@nestjs/common';
import { Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';
import { SESSION_PORT } from '@application/ports/tokens';
import { SessionPort } from '@application/ports/SessionPort';

@Injectable()
export class SessionGuard implements CanActivate {
    constructor(@Inject(SESSION_PORT) private readonly sessionPort: SessionPort) {}

    canActivate(context: ExecutionContext): boolean {
        const client: Socket = context.switchToWs().getClient();
        const session = this.sessionPort.getSession(client.id);
        // The gateway's WsErrorFilter is the only emitter of 'error'.
        if (!session) throw new WsException({ code: 'NOT_CONNECTED', message: 'Not connected' });
        return true;
    }
}
