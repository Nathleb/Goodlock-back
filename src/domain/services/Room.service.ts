import { Room } from '../types/Room.type';

export function createRoom(ownerId: string): Room {
    return {
        roomId: crypto.randomUUID(),
        name: '',
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

export function removePlayerFromRoom(room: Room, playerId: string): Room | null {
    const remaining = room.playersId.filter(id => id !== playerId);
    if (remaining.length === 0) return null;
    return {
        ...room,
        playersId: remaining,
        ownerId: room.ownerId === playerId ? remaining[0] : room.ownerId,
    };
}
