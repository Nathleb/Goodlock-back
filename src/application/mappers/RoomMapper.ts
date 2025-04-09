import { Room } from '@domain/types/Room.type';
import { RoomDTO } from '@application/dtos/Room.dto';

export class RoomMapper {
    static toDTO(room: Room): RoomDTO {
        return new RoomDTO(

        );
    }
}
