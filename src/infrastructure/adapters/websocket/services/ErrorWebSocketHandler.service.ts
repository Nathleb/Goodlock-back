import { Injectable } from '@nestjs/common';
import { WebSocketPort } from '@application/ports/WebSocketPort';

@Injectable()
export class ErrorWebSocketHandlerService {
    constructor(private readonly webSocketService: WebSocketPort) { }

    sendError(socketId: string, errorMessage: string): void {
        this.webSocketService.emitToSocket(socketId, 'error', { message: errorMessage });
    }
}
