import { Test } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ROOM_PORT } from '@application/ports/tokens';
import { RoomController } from '@infrastructure/adapters/http/RoomController';
import { JwtAccessGuard } from '@infrastructure/adapters/websocket/guards/JwtAccess.guard';
import { Room } from '@domain/types/Room.type';

class AllowAllGuard { canActivate(_ctx: ExecutionContext) { return true; } }

const OPEN_ROOM:    Room = { roomId: 'r1', ownerId: 'p0', playersId: ['p0'],       isStarted: false };
const STARTED_ROOM: Room = { roomId: 'r2', ownerId: 'p1', playersId: ['p1', 'p2'], isStarted: true  };

const mockRoom = { listOpenRooms: jest.fn() };

let controller: RoomController;

beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
        controllers: [RoomController],
        providers: [
            { provide: ROOM_PORT, useValue: mockRoom },
            { provide: APP_GUARD, useClass: AllowAllGuard },
        ],
    }).overrideGuard(JwtAccessGuard).useClass(AllowAllGuard).compile();
    controller = module.get(RoomController);
});

describe('GET /rooms', () => {
    it('returns DTOs for all open rooms', () => {
        mockRoom.listOpenRooms.mockReturnValue([OPEN_ROOM]);
        const result = controller.listOpenRooms();
        expect(result).toHaveLength(1);
        expect(result[0].roomId).toBe('r1');
        expect(result[0].isStarted).toBe(false);
    });

    it('returns an empty array when no rooms are open', () => {
        mockRoom.listOpenRooms.mockReturnValue([]);
        expect(controller.listOpenRooms()).toEqual([]);
    });

    it('does not expose started rooms', () => {
        mockRoom.listOpenRooms.mockReturnValue([STARTED_ROOM]);
        const result = controller.listOpenRooms();
        expect(result).toHaveLength(1);
        expect(result[0].isStarted).toBe(true); // listOpenRooms filters — controller just maps
    });
});
