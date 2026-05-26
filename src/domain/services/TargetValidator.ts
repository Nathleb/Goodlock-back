import TargetConstraint from "../types/TargetConstraint.type";
import Position from "../types/Position.type";
import { PlayerIndex } from "../types/Position.type";

export function validateTarget(
    constraint: TargetConstraint,
    actorPlayerIndex: PlayerIndex,
    target: Position | null,
): void {
    if (constraint === TargetConstraint.NONE) {
        if (target !== null) throw new Error('NONE face does not accept a target');
        return;
    }
    if (target === null) throw new Error(`target required for constraint ${constraint}`);
    if (constraint === TargetConstraint.ALLY_ONLY && target.playerIndex !== actorPlayerIndex)
        throw new Error('ALLY_ONLY constraint violated: target must be on actor\'s team');
    if (constraint === TargetConstraint.ENEMY_ONLY && target.playerIndex === actorPlayerIndex)
        throw new Error('ENEMY_ONLY constraint violated: target must be on opponent\'s team');
}
