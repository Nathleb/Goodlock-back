import { Room } from '../types/Room.type';
import GameState from '../types/GameState.type';

export function createRoom(ownerId: string): Room {
    return {
        roomId: crypto.randomUUID(),
        playersId: [ownerId],
        ownerId,
        isStarted: false,
    };
}

export function addPlayerToRoom(room: Room, playerId: string): Room {
    if (room.playersId.length >= 2) throw new Error('Room is full');
    if (room.isStarted) throw new Error('Game already started');
    return { ...room, playersId: [...room.playersId, playerId] };
}

export function isRoomReady(room: Room): boolean {
    return room.playersId.length === 2 && !room.isStarted;
}

export function startRoom(room: Room, gameState: GameState): Room {
    if (!isRoomReady(room)) throw new Error('Room is not ready to start');
    return { ...room, isStarted: true, gameState };
}

export function removePlayerFromRoom(room: Room, playerId: string): Room | null {
    const remaining = room.playersId.filter(id => id !== playerId);
    if (remaining.length === 0) return null;
    return {
        ...room,
        playersId: remaining,
        ownerId: room.ownerId === playerId ? remaining[0] : room.ownerId,
    };
}
