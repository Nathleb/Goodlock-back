import DieFace from "./DieFace.type";
import Position from "./Position.type";
import Character from "./Character.type";

export type QueueEntry = readonly [DieFace, Position, string]; // [dieFace, targetPosition, actorId]

export type ResolveStep = {
    readonly characterId: string;
    readonly skipped: boolean;
    readonly changes: readonly { readonly characterId: string; readonly character: Character }[];
};

type PriorityQueue = readonly QueueEntry[][];
export default PriorityQueue;
