import { Injectable, Inject, CanActivate, ExecutionContext } from '@nestjs/common';
import { Socket } from 'socket.io';
import { SESSION_PORT } from '@application/ports/tokens';
import { SessionPort } from '@application/ports/SessionPort';

@Injectable()
export class SessionGuard implements CanActivate {
    constructor(@Inject(SESSION_PORT) private readonly sessionPort: SessionPort) {}

    canActivate(context: ExecutionContext): boolean {
        const client: Socket = context.switchToWs().getClient();
        const session = this.sessionPort.getSession(client.id);
        if (!session) {
            client.emit('error', { message: 'Not connected' });
            return false;
        }
        return true;
    }
}
