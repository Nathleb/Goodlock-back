import Position, { PlayerIndex, SlotIndex } from "../types/Position.type";

export function roll1D6(): number {
    return roll1D(6);
}

export function rollRandomPosition(playerIndex: PlayerIndex, maxSlot: SlotIndex): Position {
    return { playerIndex, slot: roll1D(maxSlot) };
}

export function roll1D(size: number): number {
    return Math.floor(Math.random() * size);
}
