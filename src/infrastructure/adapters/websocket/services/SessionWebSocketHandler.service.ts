import { Injectable } from '@nestjs/common';
import { Session } from '@domain/types/Session.type';
import { WebSocketService } from './webSocket.service';

@Injectable()
export class SessionWebSocketHandlerService {
    constructor(private webSocketService: WebSocketService) { }

    notifySessionUpdate(session: Session, sessionAction: string = 'sessionUpdate'): void {
        this.webSocketService.emitToSocket(session.socketId, sessionAction, {
            sessionId: session.sessionId,
            pseudo: session.pseudo,
            inRoomId: session.inRoomId,
            isConnected: session.isConnected,
        });
    }
}
