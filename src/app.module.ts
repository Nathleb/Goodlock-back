import { Module } from '@nestjs/common';
import { GameGateway } from '@infrastructure/adapters/websocket/game.gateway';
import { RoomService } from '@domain/services/Room.service';
import { RoomWebSocketHandlerService } from '@infrastructure/adapters/websocket/services/RoomWebSocketHandler.service';
import { SessionService } from '@domain/services/Session.service';
import { WebSocketService } from '@infrastructure/adapters/websocket/services/webSocket.service';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { SessionManager } from '@infrastructure/adapters/managers/session.manager';
import { RoomManager } from '@infrastructure/adapters/managers/room.manager';

@Module({
  imports: [],
  controllers: [],
  providers: [
    SessionManager,
    RoomManager,
    GameGateway,
    WebSocketService,
    RoomService,
    RoomWebSocketHandlerService,
    RoomCoordinatorService,
    SessionService,
  ],
})
export class AppModule { }
