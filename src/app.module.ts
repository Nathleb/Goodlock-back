import { Module } from '@nestjs/common';
import { RoomService } from '@domain/services/Room.service';
import { RoomWebSocketHandlerService } from '@infrastructure/adapters/websocket/services/RoomWebSocketHandler.service';
import { SessionService } from '@domain/services/Session.service';
import { WebSocketService } from '@infrastructure/adapters/websocket/services/webSocket.service';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { SessionManager } from '@infrastructure/adapters/managers/session.manager';
import { RoomManager } from '@infrastructure/adapters/managers/room.manager';
import { ErrorWebSocketHandlerService } from '@infrastructure/adapters/websocket/services/ErrorWebSocketHandler.service';
import { SessionGateway } from '@infrastructure/adapters/websocket/session.gateway';

@Module({
  imports: [],
  controllers: [],
  providers: [
    SessionManager,
    RoomManager,
    SessionGateway,
    WebSocketService,
    RoomService,
    RoomWebSocketHandlerService,
    RoomCoordinatorService,
    SessionService,
    ErrorWebSocketHandlerService
  ],
})
export class AppModule { }
