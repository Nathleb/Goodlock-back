import { Room } from '../types/Room.type';
import GameState from '../types/GameState.type';
import { CatalogId, SessionId, RoomId } from '@shared/branded.types';
import { DomainError, domainError } from '../errors/DomainError';
import { Result, ok, err } from '@shared/result.type';

const ROOM_CAPACITY = 2;

export function createRoom(ownerId: SessionId): Room {
    return {
        roomId: crypto.randomUUID() as RoomId,
        playersId: [ownerId],
        ownerId,
        isStarted: false,
    };
}

export function addPlayerToRoom(room: Room, playerId: SessionId): Result<Room, DomainError> {
    if (room.playersId.length >= ROOM_CAPACITY) return err(domainError('ROOM_FULL', 'Room is full'));
    if (room.isStarted) return err(domainError('GAME_ALREADY_STARTED', 'Game already started'));
    return ok({ ...room, playersId: [...room.playersId, playerId] });
}

export function hasFreeSeat(room: Room): boolean {
    return room.playersId.length < ROOM_CAPACITY;
}

export function isRoomReady(room: Room): boolean {
    return room.playersId.length === ROOM_CAPACITY && !room.isStarted;
}

export function startRoom(room: Room, gameState: GameState): Result<Room, DomainError> {
    if (!isRoomReady(room)) return err(domainError('ROOM_NOT_READY', 'Room is not ready to start'));
    return ok({
        ...room,
        isStarted: true,
        gameState,
        playerOrder: [room.playersId[0], room.playersId[1]],
    });
}

export function removePlayerFromRoom(room: Room, playerId: SessionId): Room | null {
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

export function selectDeckInRoom(room: Room, playerId: SessionId, characterIds: readonly CatalogId[]): Result<Room, DomainError> {
    if (room.isStarted) return err(domainError('GAME_ALREADY_STARTED', 'Game already started'));
    if (!room.playersId.includes(playerId)) return err(domainError('NOT_IN_ROOM', 'Player is not in this room'));
    return ok({ ...room, deckSelections: { ...room.deckSelections, [playerId]: [...characterIds] } });
}

/** Both players' deck snapshots, in playersId order; an error until both have chosen a deck. */
export function selectedDecks(room: Room): Result<[readonly CatalogId[], readonly CatalogId[]], DomainError> {
    const decks = room.playersId.map(id => room.deckSelections?.[id]);
    if (decks.length !== 2 || decks.some(d => d === undefined)) {
        return err(domainError('DECKS_NOT_CHOSEN', 'Both players must choose a deck'));
    }
    return ok([decks[0] as readonly CatalogId[], decks[1] as readonly CatalogId[]]);
}

export function resolvePlayerIndex(room: Room, sessionId: SessionId): number {
    if (room.playerOrder) return room.playerOrder.indexOf(sessionId);
    return room.playersId.indexOf(sessionId);
}
