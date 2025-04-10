import { RoomService } from "@domain/services/Room.service";
import { Session } from "@domain/types/Session.type";
import { RoomManager } from "@infrastructure/adapters/managers/room.manager";

describe('RoomService', () => {
    let roomService: RoomService;
    let roomManager: RoomManager;

    beforeEach(() => {
        roomManager = new RoomManager();
        roomService = new RoomService(roomManager);
    });

    it('should create a room', () => {
        const owner: Session = { sessionId: "1", socketId: "socket1", isConnected: true, deviceIdentifier: "device1", inRoomId: "NO_ROOM", pseudo: "Player1", lastUpdate: new Date() };
        const room = roomService.createRoom(owner);
        expect(room.ownerId).toBe(owner.socketId);
    });

    it('should join a room', () => {
        const owner: Session = { sessionId: "1", socketId: "socket1", isConnected: true, deviceIdentifier: "device1", inRoomId: "NO_ROOM", pseudo: "Player1", lastUpdate: new Date() };
        const joiningPlayer: Session = { sessionId: "2", socketId: "socket2", isConnected: true, deviceIdentifier: "device2", inRoomId: "NO_ROOM", pseudo: "Player2", lastUpdate: new Date() };
        const room = roomService.createRoom(owner);
        const updatedRoom = roomService.joinRoom(joiningPlayer, room.roomId);
        expect(updatedRoom.playersId).toContain(joiningPlayer.sessionId);
    });

    it('should quit a room', () => {
        const owner: Session = { sessionId: "1", socketId: "socket1", isConnected: true, deviceIdentifier: "device1", inRoomId: "NO_ROOM", pseudo: "Player1", lastUpdate: new Date() };
        roomService.createRoom(owner);
        const updatedRoom = roomService.quitRoom(owner);
        expect(updatedRoom).toBeNull();
    });

    it('should get a room by roomId', () => {
        const owner: Session = { sessionId: "1", socketId: "socket1", isConnected: true, deviceIdentifier: "device1", inRoomId: "NO_ROOM", pseudo: "Player1", lastUpdate: new Date() };
        const room = roomService.createRoom(owner);
        const fetchedRoom = roomService.getRoom(room.roomId);
        expect(fetchedRoom?.roomId).toBe(room.roomId);
    });
});
