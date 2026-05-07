import { createRoom, addPlayerToRoom, removePlayerFromRoom } from "@domain/services/Room.service";

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
});
