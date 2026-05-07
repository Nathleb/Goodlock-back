import { Room } from '@domain/types/Room.type';

export interface RoomPort {
    createRoom(ownerId: string): Room;
    joinRoom(playerId: string, roomId: string): Room;
    quitRoom(playerId: string): Room | null;
    getRoom(roomId: string): Room | undefined;
}
