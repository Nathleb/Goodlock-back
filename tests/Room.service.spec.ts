import { P0, P1, asSession } from './helpers/ids';
import { TEST_CATALOG_ID } from './helpers/catalog';
import EffectLabel from "@domain/types/EffectLabels.type";
import { enemyRel } from "./helpers/targets";
import { SlotIndex } from "@domain/types/Position.type";
import { createRoom, addPlayerToRoom, removePlayerFromRoom, isRoomReady, startRoom, selectDeckInRoom, selectedDecks, setPresenceInRoom } from "@domain/services/Room.service";
import { unwrap, unwrapErr } from "./helpers/result";
import { CatalogId } from "@shared/branded.types";
import { Room } from "@domain/types/Room.type";
import { createGameState } from "./helpers/gameState";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createPlayer } from "@domain/services/Player.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";

const die = generateFullDie([
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
] as BaseDieInstructions);
const makeTeam = (pi: 0 | 1) => createPlayer([0,1,2,3,4].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: "C", maxHp: 100, baseSpeed: 1, baseDie: die, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);
const gameState = createGameState(makeTeam(0), makeTeam(1));

describe('RoomService', () => {
  it('should create a room with the owner as the first player', () => {
    const room = createRoom(asSession('player1'));
    expect(room.ownerId).toBe(asSession('player1'));
    expect(room.playersId).toContain(asSession('player1'));
    expect(room.isStarted).toBe(false);
  });

  it('should add a second player to a room', () => {
    const room = createRoom(asSession('player1'));
    const updated = unwrap(addPlayerToRoom(room, asSession('player2')));
    expect(updated.playersId).toContain(asSession('player2'));
    expect(updated.playersId.length).toBe(2);
  });

  it('should return a ROOM_FULL error when adding a player to a full room', () => {
    const room = createRoom(asSession('player1'));
    const full = unwrap(addPlayerToRoom(room, asSession('player2')));
    expect(unwrapErr(addPlayerToRoom(full, asSession('player3')))).toEqual({ code: 'ROOM_FULL', message: 'Room is full' });
  });

  it('should return a GAME_ALREADY_STARTED error when adding a player to a started game', () => {
    const room = { ...createRoom(asSession('player1')), isStarted: true };
    expect(unwrapErr(addPlayerToRoom(room, asSession('player2')))).toEqual({ code: 'GAME_ALREADY_STARTED', message: 'Game already started' });
  });

  it('should return null when the last player leaves', () => {
    const room = createRoom(asSession('player1'));
    expect(removePlayerFromRoom(room, asSession('player1'))).toBeNull();
  });

  it('should transfer ownership when the owner leaves', () => {
    const room = createRoom(asSession('player1'));
    const withTwo = unwrap(addPlayerToRoom(room, asSession('player2')));
    const updated = removePlayerFromRoom(withTwo, asSession('player1'));
    expect(updated?.ownerId).toBe(asSession('player2'));
  });

  it('isRoomReady returns true with 2 players and not started', () => {
    const room = unwrap(addPlayerToRoom(createRoom(asSession('player1')), asSession('player2')));
    expect(isRoomReady(room)).toBe(true);
  });

  it('isRoomReady returns false with only 1 player', () => {
    expect(isRoomReady(createRoom(asSession('player1')))).toBe(false);
  });

  it('isRoomReady returns false when already started', () => {
    const room = unwrap(startRoom(unwrap(addPlayerToRoom(createRoom(asSession('player1')), asSession('player2'))), gameState));
    expect(isRoomReady(room)).toBe(false);
  });

  it('startRoom sets isStarted and attaches gameState', () => {
    const room = unwrap(addPlayerToRoom(createRoom(asSession('player1')), asSession('player2')));
    const started = unwrap(startRoom(room, gameState));
    expect(started.isStarted).toBe(true);
    expect(started.gameState).toBe(gameState);
  });

  it('startRoom returns a ROOM_NOT_READY error when room is not ready', () => {
    expect(unwrapErr(startRoom(createRoom(asSession('player1')), gameState))).toEqual({ code: 'ROOM_NOT_READY', message: 'Room is not ready to start' });
  });
});

describe('deck selection in the lobby', () => {
    const SIX = ['a', 'b', 'c', 'd', 'e', 'f'] as CatalogId[];
    const OTHER = ['h', 'i', 'j', 'k', 'l', 'm'] as CatalogId[];
    const lobby = () => unwrap(addPlayerToRoom(createRoom(P0), P1));

    it('stores a snapshot of the chosen deck per player', () => {
        const room = unwrap(selectDeckInRoom(lobby(), P0, SIX));
        expect(room.deckSelections).toEqual({ p0: SIX });
    });

    it('replaces a previous choice', () => {
        const room = unwrap(selectDeckInRoom(unwrap(selectDeckInRoom(lobby(), P0, SIX)), P0, OTHER));
        expect(room.deckSelections).toEqual({ p0: OTHER });
    });

    it('refuses a player who is not in the room', () => {
        expect(unwrapErr(selectDeckInRoom(lobby(), asSession('stranger'), SIX)).code).toBe('NOT_IN_ROOM');
    });

    it('refuses once the game has started', () => {
        const started = { ...lobby(), isStarted: true };
        expect(unwrapErr(selectDeckInRoom(started, P0, SIX)).code).toBe('GAME_ALREADY_STARTED');
    });

    it("drops a leaving player's choice", () => {
        const room = unwrap(selectDeckInRoom(unwrap(selectDeckInRoom(lobby(), P0, SIX)), P1, OTHER));
        expect(removePlayerFromRoom(room, P1)?.deckSelections).toEqual({ p0: SIX });
    });

    it('selectedDecks returns both snapshots in player order, or a DECKS_NOT_CHOSEN error', () => {
        const one = unwrap(selectDeckInRoom(lobby(), P0, SIX));
        expect(unwrapErr(selectedDecks(one)).code).toBe('DECKS_NOT_CHOSEN');
        const both = unwrap(selectDeckInRoom(one, P1, OTHER));
        expect(unwrap(selectedDecks(both))).toEqual([SIX, OTHER]);
    });
});

describe('lobby edge cases', () => {
    const DECK = ['a', 'b', 'c', 'd', 'e', 'f'] as CatalogId[];

    it('selectedDecks refuses a room where nobody chose a deck yet', () => {
        const nobody = unwrap(addPlayerToRoom(createRoom(P0), P1));
        expect(nobody.deckSelections).toBeUndefined();
        expect(unwrapErr(selectedDecks(nobody))).toEqual({ code: 'DECKS_NOT_CHOSEN', message: 'Both players must choose a deck' });
    });

    it('selectedDecks refuses a room with a single player, even with a deck', () => {
        const alone = unwrap(selectDeckInRoom(createRoom(P0), P0, DECK));
        expect(unwrapErr(selectedDecks(alone)).code).toBe('DECKS_NOT_CHOSEN');
    });

    it('explains why a deck choice is refused', () => {
        const lobby = unwrap(addPlayerToRoom(createRoom(P0), P1));
        expect(unwrapErr(selectDeckInRoom({ ...lobby, isStarted: true }, P0, DECK)).message).toBe('Game already started');
        expect(unwrapErr(selectDeckInRoom(lobby, asSession('stranger'), DECK)).message).toBe('Player is not in this room');
    });

    it('setPresenceInRoom updates the seat it is given, seat 0 included', () => {
        const started = { ...unwrap(addPlayerToRoom(createRoom(P0), P1)), presence: [{ connected: true, disconnectedAt: null }, { connected: true, disconnectedAt: null }] as Room['presence'] };
        expect(setPresenceInRoom(started, 0, false, 42).presence).toEqual([{ connected: false, disconnectedAt: 42 }, { connected: true, disconnectedAt: null }]);
        expect(setPresenceInRoom(started, 2, false, 42)).toBe(started);
    });
});
