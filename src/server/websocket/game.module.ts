import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { RoomService } from 'src/server/websocket/services/room.service';
import { SessionService } from 'src/server/websocket/services/session.service';

@Module({
    providers: [GameGateway, RoomService, SessionService],
})
export class GameModule { }