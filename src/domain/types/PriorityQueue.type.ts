import DieFace from "./DieFace.type";
import Position from "./Position.type";
import Character from "./Character.type";
import EffectLabel from "./EffectLabels.type";
import { CharacterId } from "@shared/branded.types";

// [dieFace, actorId, actorSpeed] — targets are resolved per effect at resolution time.
export type QueueEntry = readonly [DieFace, CharacterId, number];

export type ResolvedEffect = {
    readonly effect: EffectLabel;
    readonly targets: readonly Position[];   // [] = fizzled
};

export type ResolveStep = {
    readonly characterId: CharacterId;
    readonly skipped: boolean;
    readonly effects: readonly ResolvedEffect[];
    readonly changes: readonly { readonly characterId: CharacterId; readonly character: Character }[];
};

type PriorityQueue = readonly QueueEntry[];
export default PriorityQueue;
