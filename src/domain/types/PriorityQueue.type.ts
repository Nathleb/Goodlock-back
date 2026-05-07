import Effect from "./Effect.type";
import Position from "./Position.type";

export type QueueEntry = [Effect, Position, string]; // [effect, targetPosition, actorId]
type PriorityQueue = QueueEntry[][];

export default PriorityQueue;
