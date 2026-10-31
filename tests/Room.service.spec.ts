import { TEST_CATALOG_ID } from './helpers/catalog';
import EffectLabel from "@domain/types/EffectLabels.type";
import { enemyRel } from "./helpers/targets";
import { SlotIndex } from "@domain/types/Position.type";
import { createRoom, addPlayerToRoom, removePlayerFromRoom, isRoomReady, startRoom, selectDeckInRoom, selectedDecks } from "@domain/services/Room.service";
import { unwrap, unwrapErr } from "./helpers/result";
import { CatalogId } from "@shared/branded.types";
import { createGameState, buildEffectFactory } from "@domain/services/GameInit.service";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createPlayer } from "@domain/services/Player.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";

const factory = buildEffectFactory();
const die = generateFullDie([
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
] as BaseDieInstructions, factory);
const makeTeam = (pi: 0 | 1) => createPlayer([0,1,2,3,4].map(i => createCharacter({ catalogId: TEST_CATALOG_ID, name: "C", maxHp: 100, baseSpeed: 1, baseDie: die, position: { playerIndex: pi, slot: i as SlotIndex } })), pi);
const gameState = createGameState(makeTeam(0), makeTeam(1));

describe('RoomService', () => {
  it('should create a room with the owner as the first player', () => {
    const room = createRoom("player1");
    expect(room.ownerId).toBe("player1");
    expect(room.playersId).toContain("player1");
    expect(room.isStarted).toBe(false);
  });

  it('should add a second player to a room', () => {
    const room = createRoom("player1");
    const updated = unwrap(addPlayerToRoom(room, "player2"));
    expect(updated.playersId).toContain("player2");
    expect(updated.playersId.length).toBe(2);
  });

  it('should return a ROOM_FULL error when adding a player to a full room', () => {
    const room = createRoom("player1");
    const full = unwrap(addPlayerToRoom(room, "player2"));
    expect(unwrapErr(addPlayerToRoom(full, "player3"))).toEqual({ code: 'ROOM_FULL', message: 'Room is full' });
  });

  it('should return a GAME_ALREADY_STARTED error when adding a player to a started game', () => {
    const room = { ...createRoom("player1"), isStarted: true };
    expect(unwrapErr(addPlayerToRoom(room, "player2"))).toEqual({ code: 'GAME_ALREADY_STARTED', message: 'Game already started' });
  });

  it('should return null when the last player leaves', () => {
    const room = createRoom("player1");
    expect(removePlayerFromRoom(room, "player1")).toBeNull();
  });

  it('should transfer ownership when the owner leaves', () => {
    const room = createRoom("player1");
    const withTwo = unwrap(addPlayerToRoom(room, "player2"));
    const updated = removePlayerFromRoom(withTwo, "player1");
    expect(updated?.ownerId).toBe("player2");
  });

  it('isRoomReady returns true with 2 players and not started', () => {
    const room = unwrap(addPlayerToRoom(createRoom("player1"), "player2"));
    expect(isRoomReady(room)).toBe(true);
  });

  it('isRoomReady returns false with only 1 player', () => {
    expect(isRoomReady(createRoom("player1"))).toBe(false);
  });

  it('isRoomReady returns false when already started', () => {
    const room = unwrap(startRoom(unwrap(addPlayerToRoom(createRoom("player1"), "player2")), gameState));
    expect(isRoomReady(room)).toBe(false);
  });

  it('startRoom sets isStarted and attaches gameState', () => {
    const room = unwrap(addPlayerToRoom(createRoom("player1"), "player2"));
    const started = unwrap(startRoom(room, gameState));
    expect(started.isStarted).toBe(true);
    expect(started.gameState).toBe(gameState);
  });

  it('startRoom returns a ROOM_NOT_READY error when room is not ready', () => {
    expect(unwrapErr(startRoom(createRoom("player1"), gameState))).toEqual({ code: 'ROOM_NOT_READY', message: 'Room is not ready to start' });
  });
});

describe('deck selection in the lobby', () => {
    const SEVEN = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as CatalogId[];
    const OTHER = ['h', 'i', 'j', 'k', 'l', 'm', 'n'] as CatalogId[];
    const lobby = () => unwrap(addPlayerToRoom(createRoom('p0'), 'p1'));

    it('stores a snapshot of the chosen deck per player', () => {
        const room = unwrap(selectDeckInRoom(lobby(), 'p0', SEVEN));
        expect(room.deckSelections).toEqual({ p0: SEVEN });
    });

    it('replaces a previous choice', () => {
        const room = unwrap(selectDeckInRoom(unwrap(selectDeckInRoom(lobby(), 'p0', SEVEN)), 'p0', OTHER));
        expect(room.deckSelections).toEqual({ p0: OTHER });
    });

    it('refuses a player who is not in the room', () => {
        expect(unwrapErr(selectDeckInRoom(lobby(), 'stranger', SEVEN)).code).toBe('NOT_IN_ROOM');
    });

    it('refuses once the game has started', () => {
        const started = { ...lobby(), isStarted: true };
        expect(unwrapErr(selectDeckInRoom(started, 'p0', SEVEN)).code).toBe('GAME_ALREADY_STARTED');
    });

    it("drops a leaving player's choice", () => {
        const room = unwrap(selectDeckInRoom(unwrap(selectDeckInRoom(lobby(), 'p0', SEVEN)), 'p1', OTHER));
        expect(removePlayerFromRoom(room, 'p1')?.deckSelections).toEqual({ p0: SEVEN });
    });

    it('selectedDecks returns both snapshots in player order, or a DECKS_NOT_CHOSEN error', () => {
        const one = unwrap(selectDeckInRoom(lobby(), 'p0', SEVEN));
        expect(unwrapErr(selectedDecks(one)).code).toBe('DECKS_NOT_CHOSEN');
        const both = unwrap(selectDeckInRoom(one, 'p1', OTHER));
        expect(unwrap(selectedDecks(both))).toEqual([SEVEN, OTHER]);
    });
});
