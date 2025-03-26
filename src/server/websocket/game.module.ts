import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { RoomService } from 'src/domain/services/Room.service';
import { SessionService } from 'src/domain/services/Session.service';

@Module({
    providers: [GameGateway, RoomService, SessionService],
})
export class GameModule { }