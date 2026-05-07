import Effect from "./Effect.type";
import Position from "./Position.type";
import Character from "./Character.type";

export type QueueEntry = [Effect, Position, string]; // [effect, targetPosition, actorId]

export type ResolveStep = {
    actorId: string;
    actorName: string;
    effectDescription: string;
    skipped: boolean;
    changes: { characterId: string; character: Character }[];
};

type PriorityQueue = QueueEntry[][];
export default PriorityQueue;
