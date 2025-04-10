import { Injectable } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@Injectable()
@WebSocketGateway(3002, { cors: true })
export class SharedWebSocketService {

    @WebSocketServer()
    private server: Server;

    setServer(server: Server) {
        this.server = server;
    }

    getServer(): Server {
        return this.server;
    }
}


