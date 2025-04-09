import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { Room } from "../types/Room.type";

@Injectable()
export class RoomManager {
    private rooms: Map<string, Room> = new Map<string, Room>();

    createRoom(ownerId: string): Room {
        const roomId = `${randomUUID()}`;

        const Room: Room = {
            roomId: roomId,
            ownerId: ownerId,
            // name: gameParameters.roomName,
            // isPublic: gameParameters.isPublic
            playersId: [ownerId],
            isStarted: false
        };

        this.rooms.set(roomId, Room);
        return Room;
    }

    getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }

    getAllRoom(): Room[] {
        return Array.from(this.rooms.values());
    }

    deleteRoom(roomId: string): undefined {
        this.rooms.delete(roomId);
        return undefined;
    }

    updateRoom(roomId: string, partialRoom: Partial<Room>): Room | undefined {
        const existingRoom = this.rooms.get(roomId);
        if (!existingRoom) {
            return undefined;
        }

        const updatedRoom = { ...existingRoom, ...partialRoom };
        this.rooms.set(roomId, updatedRoom);
        return updatedRoom;
    }
}

export const roomManager = new RoomManager();