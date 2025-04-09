import { Room } from '@domain/types/Room.type';
import { Session } from '@domain/types/Session.type';

export interface RoomPort {
    createRoom(owner: Session): Room;
    joinRoom(joiningPlayer: Session, roomId: string): Room;
    quitRoom(session: Session): Room | null;
    getRoom(roomId: string): Room | undefined;
}
