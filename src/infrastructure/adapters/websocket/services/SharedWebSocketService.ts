import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class SharedWebSocketService {
    private server: Server;

    setServer(server: Server): void {
        this.server = server;
    }

    getServer(): Server {
        return this.server;
    }
}
