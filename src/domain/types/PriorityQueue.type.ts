import DieFace from "./DieFace.type";
import Position from "./Position.type";
import Character from "./Character.type";

export type QueueEntry = [DieFace, Position, string]; // [dieFace, targetPosition, actorId]

export type ResolveStep = {
    characterId: string;
    skipped: boolean;
    changes: { characterId: string; character: Character }[];
};

type PriorityQueue = QueueEntry[][];
export default PriorityQueue;
