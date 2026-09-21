import DieFace from "./DieFace.type";
import Position from "./Position.type";
import Character from "./Character.type";
import EffectLabel from "./EffectLabels.type";

// [dieFace, actorId, actorSpeed] — targets are resolved per effect at resolution time.
export type QueueEntry = readonly [DieFace, string, number];

export type ResolvedEffect = {
    readonly effect: EffectLabel;
    readonly targets: readonly Position[];   // [] = fizzled
};

export type ResolveStep = {
    readonly characterId: string;
    readonly skipped: boolean;
    readonly effects: readonly ResolvedEffect[];
    readonly changes: readonly { readonly characterId: string; readonly character: Character }[];
};

type PriorityQueue = readonly QueueEntry[];
export default PriorityQueue;
