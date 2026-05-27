import { Controller, Get, UseGuards, Inject } from '@nestjs/common';
import { JwtAccessGuard } from '../websocket/guards/JwtAccess.guard';
import { ROOM_PORT } from '@application/ports/tokens';
import { RoomPort } from '@application/ports/RoomPort';
import { RoomMapper } from '@application/mappers/RoomMapper';
import { RoomDTO } from '@application/dtos/Room.dto';

@Controller('rooms')
@UseGuards(JwtAccessGuard)
export class RoomController {
    constructor(@Inject(ROOM_PORT) private readonly roomPort: RoomPort) {}

    @Get()
    listOpenRooms(): RoomDTO[] {
        return this.roomPort.listOpenRooms().map(RoomMapper.toDTO);
    }
}
