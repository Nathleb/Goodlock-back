import Position, { PlayerIndex, SlotIndex } from "../types/Position.type";
import TargetGroup from "../types/TargetGroup.type";

const MIN_SLOT = 0;
const MAX_SLOT = 4;

export function resolveTargets(groups: readonly TargetGroup[], actor: Position): Position[] {
    // Repeated cells are kept on purpose: overlapping patterns stack.
    const out: Position[] = [];
    for (const group of groups) {
        const playerIndex = (group.side === 'ALLY' ? actor.playerIndex : 1 - actor.playerIndex) as PlayerIndex;
        for (const n of group.n) {
            const slot = group.mode === 'ABSOLUTE' ? n : actor.slot + n;
            if (slot < MIN_SLOT || slot > MAX_SLOT) continue;
            out.push({ playerIndex, slot: slot as SlotIndex });
        }
    }
    return out;
}
