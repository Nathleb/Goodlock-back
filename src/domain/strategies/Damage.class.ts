import { dealDamage, isDead, netStat, stateValue } from "../services/Character.service";
import Character from "../types/Character.type";
import Position from "../types/Position.type";
import GameState from "../types/GameState.type";
import { applyAtPositions } from "../utils/TargetUtils";
import Effect from "../types/Effect.type";
import { CharacterId } from "@shared/branded.types";

/** The whole DIVINE_SHIELD axis is spent by the hit it nullifies. */
function consumeDivineShield(character: Character): Character {
    const { DIVINE_SHIELD: _spent, ...states } = character.states;
    return { ...character, states };
}

export default class Damage implements Effect {
    constructor(private readonly amount: number) {}

    solve(gameState: GameState, targets: readonly Position[], actorId: CharacterId): { state: GameState; affected: CharacterId[] } {
        const actor = gameState.players.flatMap(p => p.team).find(c => c.id === actorId);
        const power = actor ? netStat(actor, 'POWER') : 0;
        // Read on each target cell, so an area pattern is reduced cell by cell.
        return applyAtPositions(gameState, targets, c => {
            const amount = Math.max(0, this.amount + power - netStat(c, 'ARMOR'));
            // A hit that would hurt is nullified by DIVINE_SHIELD, which it consumes.
            if (amount > 0 && !isDead(c) && stateValue(c, 'DIVINE_SHIELD') > 0) return consumeDivineShield(c);
            return dealDamage(c, amount);
        });
    }
}
