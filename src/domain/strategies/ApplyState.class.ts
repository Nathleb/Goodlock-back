import { isDead, stateValue } from "../services/Character.service";
import Position from "../types/Position.type";
import GameState from "../types/GameState.type";
import { STATE_DEFS, StateName } from "../types/State.type";
import { applyAtPositions } from "../utils/TargetUtils";
import Effect from "../types/Effect.type";

/** Pushes the duration of a state onto its axis for the occupant of each cell, once per occurrence. A dead occupant gets nothing. */
export default class ApplyState implements Effect {
    constructor(
        private readonly state: StateName,
        private readonly duration: number,
    ) {}

    solve(gameState: GameState, targets: readonly Position[], _actorId: string): { state: GameState; affected: string[] } {
        const { axis, sign } = STATE_DEFS[this.state];
        return applyAtPositions(gameState, targets, c => {
            if (isDead(c)) return c;
            const value = stateValue(c, axis) + sign * this.duration;
            const { [axis]: _previous, ...others } = c.states;
            // An axis that reaches 0 is dropped, so a cancelled state leaves nothing behind.
            const states = value === 0 ? others : { ...others, [axis]: { value, touchedRound: gameState.currentRound } };
            return { ...c, states };
        });
    }
}
