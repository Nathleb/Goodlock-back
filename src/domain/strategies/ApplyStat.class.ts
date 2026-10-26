import { isDead } from "../services/Character.service";
import Position from "../types/Position.type";
import GameState from "../types/GameState.type";
import { StatName } from "../types/Modifier.type";
import { applyAtPositions } from "../utils/TargetUtils";
import Effect from "../types/Effect.type";

/** Adds one stat instance (buff or debuff) to the occupant of each cell, once per occurrence. A dead occupant gets none: nothing revives it. */
export default class ApplyStat implements Effect {
    constructor(
        private readonly stat: StatName,
        private readonly value: number,
        private readonly duration: number,
    ) {}

    solve(gameState: GameState, targets: readonly Position[], _actorId: string): { state: GameState; affected: string[] } {
        const instance = { stat: this.stat, value: this.value, roundsLeft: this.duration, appliedRound: gameState.currentRound };
        return applyAtPositions(gameState, targets, c => isDead(c) ? c : { ...c, modifiers: [...c.modifiers, instance] });
    }
}
