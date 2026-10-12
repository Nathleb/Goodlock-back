import { Room } from '../types/Room.type';
import GameState from '../types/GameState.type';
import { PlayerPresence } from '../types/Presence.type';
import { CatalogId } from '@shared/branded.types';

const CONNECTED: PlayerPresence = { connected: true, disconnectedAt: null };

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
    return {
        ...room,
        isStarted: true,
        gameState,
        playerOrder: [room.playersId[0], room.playersId[1]],
        presence: [CONNECTED, CONNECTED],
    };
}

export function removePlayerFromRoom(room: Room, playerId: string): Room | null {
    const remaining = room.playersId.filter(id => id !== playerId);
    if (remaining.length === 0) return null;
    const { [playerId]: _left, ...deckSelections } = room.deckSelections ?? {};
    return {
        ...room,
        playersId: remaining,
        ownerId: room.ownerId === playerId ? remaining[0] : room.ownerId,
        deckSelections,
    };
}

export function selectDeckInRoom(room: Room, playerId: string, characterIds: readonly CatalogId[]): Room {
    if (room.isStarted) throw new Error('Game already started');
    if (!room.playersId.includes(playerId)) throw new Error('Player is not in this room');
    return { ...room, deckSelections: { ...room.deckSelections, [playerId]: [...characterIds] } };
}

/** Both players' deck snapshots, in playersId order. Throws until both have chosen a deck. */
export function assertDecksSelected(room: Room): [readonly CatalogId[], readonly CatalogId[]] {
    const decks = room.playersId.map(id => room.deckSelections?.[id]);
    if (decks.length !== 2 || decks.some(d => d === undefined)) throw new Error('Both players must choose a deck');
    return [decks[0] as readonly CatalogId[], decks[1] as readonly CatalogId[]];
}

export function resolvePlayerIndex(room: Room, sessionId: string): number {
    if (room.playerOrder) return room.playerOrder.indexOf(sessionId);
    return room.playersId.indexOf(sessionId);
}

export function setPresenceInRoom(room: Room, playerIndex: number, connected: boolean, now: number): Room {
    if (!room.presence) return room;
    if (playerIndex < 0 || playerIndex >= room.presence.length) return room;
    const presence: [PlayerPresence, PlayerPresence] = [...room.presence];
    presence[playerIndex] = { connected, disconnectedAt: connected ? null : now };
    return { ...room, presence };
}
