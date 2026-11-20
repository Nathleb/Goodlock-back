import DieFace from "./DieFace.type";
import Position from "./Position.type";
import Character from "./Character.type";
import EffectLabel from "./EffectLabels.type";
import { CharacterId } from "@shared/branded.types";

// [dieFace, actorId, actorSpeed] — targets are resolved per effect at resolution time.
export type QueueEntry = readonly [DieFace, CharacterId, number];

/** One effect of an action as it resolved: its parts, in order, and its cells (RES-2). */
export type ResolvedEffect = {
    readonly parts: readonly EffectLabel[];
    readonly targets: readonly Position[];   // [] = fizzled
};

export type ResolveStep = {
    readonly characterId: CharacterId;
    readonly skipped: boolean;
    /** True only for an action the match, already decided, did not play (END-1); such a step is also skipped. */
    readonly unplayed: boolean;
    readonly effects: readonly ResolvedEffect[];
    readonly changes: readonly { readonly characterId: CharacterId; readonly character: Character }[];
};

type PriorityQueue = readonly QueueEntry[];
export default PriorityQueue;
