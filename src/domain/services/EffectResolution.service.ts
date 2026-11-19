import Character from "../types/Character.type";
import { FaceEffect, FacePart } from "../types/DieFace.type";
import EffectLabel from "../types/EffectLabels.type";
import GameState from "../types/GameState.type";
import Position from "../types/Position.type";
import { effectFor } from "../strategies/effectFor";
import { applyAtPositions, settleDeaths } from "../utils/TargetUtils";
import { stateValue } from "./Character.service";
import { CharacterId } from "@shared/branded.types";

export type AppliedEffect = { readonly state: GameState; readonly affected: CharacterId[] };

const occupant = (state: GameState, cell: Position): Character | undefined =>
    state.players[cell.playerIndex].team.find(c => c.position.slot === cell.slot);

/** The Damage part nullified on its holder: the Divine Shield was there before it and is gone after it. */
const spentDivineShield = (part: FacePart, before: Character, after: Character | undefined): boolean =>
    part.label === EffectLabel.Damage && stateValue(before, 'DIVINE_SHIELD') > 0
        && after !== undefined && stateValue(after, 'DIVINE_SHIELD') === 0;

/** The holder as it was before the effect, without its Divine Shield (STATE-6). */
function nullifyOn(state: GameState, cell: Position, original: Character): GameState {
    const { DIVINE_SHIELD: _spent, ...states } = original.states;
    return applyAtPositions(state, [cell], () => ({ ...original, states })).state;
}

/**
 * Applies one effect to its resolved cells (SEQ-1): for each cell, in order, its parts apply one
 * after another. A cell listed twice receives the whole effect twice (TGT-2). A Swap is the only
 * part of its effect (SWAP-1) and names its two cells together. A Damage part nullified by Divine
 * Shield nullifies the whole effect on its holder: it goes back to what it was before the effect,
 * without the state, and the rest of the effect skips it (STATE-6). Deaths settle once the whole
 * effect has applied (DEAD-1).
 */
export function applyEffect(gameState: GameState, effect: FaceEffect, targets: readonly Position[], actorId: CharacterId): AppliedEffect {
    const [first] = effect.parts;
    if (first.label === EffectLabel.Swap) return effectFor(first).solve(gameState, targets, actorId);

    let state = gameState;
    const affected: CharacterId[] = [];
    const nullified = new Set<CharacterId>();
    for (const cell of targets) {
        const original = occupant(gameState, cell);
        for (const part of effect.parts) {
            const holder = occupant(state, cell);
            if (holder !== undefined && nullified.has(holder.id)) break;
            const applied = effectFor(part).solve(state, [cell], actorId);
            state = applied.state;
            applied.affected.filter(id => !affected.includes(id)).forEach(id => affected.push(id));
            if (holder !== undefined && original !== undefined && spentDivineShield(part, holder, occupant(state, cell))) {
                state = nullifyOn(state, cell, original);
                nullified.add(holder.id);
            }
        }
    }
    return { state: settleDeaths(state), affected };
}
