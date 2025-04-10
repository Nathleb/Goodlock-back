import { Injectable } from '@nestjs/common';
import { WebSocketService } from './webSocket.service';

@Injectable()
export class ErrorWebSocketHandlerService {
    constructor(private readonly webSocketService: WebSocketService) { }

    sendError(socketId: string, errorMessage: string): void {
        this.webSocketService.emitToSocket(socketId, 'error', { message: errorMessage });
    }
}
