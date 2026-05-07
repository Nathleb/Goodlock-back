import EffectLabel from "@domain/types/EffectLabels.type";
import { createRoom, addPlayerToRoom, removePlayerFromRoom, isRoomReady, startRoom } from "@domain/services/Room.service";
import { createGameState, initializeEffects } from "@domain/services/GameInit.service";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createPlayer } from "@domain/services/Player.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";

initializeEffects();
const die = generateFullDie([
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "D", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
] as BaseDieInstructions);
const makeTeam = (pi: 0 | 1) => createPlayer([0,1,2,3,4].map(i => createCharacter("C", 100, 1, die, { playerIndex: pi, slot: i })), pi);
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
    const updated = addPlayerToRoom(room, "player2");
    expect(updated.playersId).toContain("player2");
    expect(updated.playersId.length).toBe(2);
  });

  it('should throw when adding a player to a full room', () => {
    const room = createRoom("player1");
    const full = addPlayerToRoom(room, "player2");
    expect(() => addPlayerToRoom(full, "player3")).toThrow("Room is full");
  });

  it('should throw when adding a player to a started game', () => {
    const room = { ...createRoom("player1"), isStarted: true };
    expect(() => addPlayerToRoom(room, "player2")).toThrow("Game already started");
  });

  it('should return null when the last player leaves', () => {
    const room = createRoom("player1");
    expect(removePlayerFromRoom(room, "player1")).toBeNull();
  });

  it('should transfer ownership when the owner leaves', () => {
    const room = createRoom("player1");
    const withTwo = addPlayerToRoom(room, "player2");
    const updated = removePlayerFromRoom(withTwo, "player1");
    expect(updated?.ownerId).toBe("player2");
  });

  it('isRoomReady returns true with 2 players and not started', () => {
    const room = addPlayerToRoom(createRoom("player1"), "player2");
    expect(isRoomReady(room)).toBe(true);
  });

  it('isRoomReady returns false with only 1 player', () => {
    expect(isRoomReady(createRoom("player1"))).toBe(false);
  });

  it('isRoomReady returns false when already started', () => {
    const room = startRoom(addPlayerToRoom(createRoom("player1"), "player2"), gameState);
    expect(isRoomReady(room)).toBe(false);
  });

  it('startRoom sets isStarted and attaches gameState', () => {
    const room = addPlayerToRoom(createRoom("player1"), "player2");
    const started = startRoom(room, gameState);
    expect(started.isStarted).toBe(true);
    expect(started.gameState).toBe(gameState);
  });

  it('startRoom throws when room is not ready', () => {
    expect(() => startRoom(createRoom("player1"), gameState)).toThrow('Room is not ready to start');
  });
});
