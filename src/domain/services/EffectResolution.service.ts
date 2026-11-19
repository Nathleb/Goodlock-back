import { FaceEffect } from "../types/DieFace.type";
import EffectLabel from "../types/EffectLabels.type";
import GameState from "../types/GameState.type";
import Position from "../types/Position.type";
import { effectFor } from "../strategies/effectFor";
import { settleDeaths } from "../utils/TargetUtils";
import { CharacterId } from "@shared/branded.types";

export type AppliedEffect = { readonly state: GameState; readonly affected: CharacterId[] };

/**
 * Applies one effect to its resolved cells (SEQ-1): for each cell, in order, its parts apply one
 * after another. A cell listed twice receives the whole effect twice (TGT-2). A Swap is the only
 * part of its effect (SWAP-1) and names its two cells together. Deaths settle once the whole
 * effect has applied (DEAD-1).
 */
export function applyEffect(gameState: GameState, effect: FaceEffect, targets: readonly Position[], actorId: CharacterId): AppliedEffect {
    const [first] = effect.parts;
    if (first?.label === EffectLabel.Swap) return effectFor(first).solve(gameState, targets, actorId);

    let state = gameState;
    const affected: CharacterId[] = [];
    for (const cell of targets) {
        for (const part of effect.parts) {
            const applied = effectFor(part).solve(state, [cell], actorId);
            state = applied.state;
            applied.affected.filter(id => !affected.includes(id)).forEach(id => affected.push(id));
        }
    }
    return { state: settleDeaths(state), affected };
}
