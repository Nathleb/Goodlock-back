import { RoomMapper } from "@application/mappers/RoomMapper";
import { Room } from "@domain/types/Room.type";

describe('RoomMapper', () => {
    it('should map Room to RoomDTO', () => {
        const room: Room = {
            roomId: "room1",
            name: "Test Room",
            playersId: ["player1", "player2"],
            ownerId: "player1",
            isStarted: false,
            gameState: undefined
        };
        const roomDTO = RoomMapper.toDTO(room);
        expect(roomDTO.roomId).toBe(room.roomId);
        expect(roomDTO.isStarted).toBe(room.isStarted);
    });
});
