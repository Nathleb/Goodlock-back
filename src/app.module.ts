import { Module } from '@nestjs/common';
import { GameGateway } from './infrastructure/adapters/websocket/game.gateway';
import { RoomService } from './infrastructure/adapters/websocket/services/Room.service';
import { RoomWebSocketHandlerService } from './infrastructure/adapters/websocket/services/RoomWebSocketHandler.service';
import { RoomCoordinatorService } from './infrastructure/adapters/websocket/services/RoomCoordinator.service';
import { SessionService } from './infrastructure/adapters/websocket/services/Session.service';
import { WebSocketService } from './infrastructure/adapters/websocket/services/webSocket.service';
import { ROOM_PORT, SESSION_PORT } from './application/ports/tokens';

@Module({
  imports: [],
  controllers: [],
  providers: [
    GameGateway,
    RoomService,
    RoomWebSocketHandlerService,
    RoomCoordinatorService,
    WebSocketService,
    { provide: ROOM_PORT, useClass: RoomCoordinatorService },
    { provide: SESSION_PORT, useClass: SessionService }
  ],
})
export class AppModule { }
