import Position, { BOARD_SIZE, PlayerIndex, SlotIndex } from "../types/Position.type";
import TargetGroup from "../types/TargetGroup.type";
import EffectLabel from "../types/EffectLabels.type";
import { STAT_NAMES } from "../types/Modifier.type";
import { STATE_NAMES } from "../types/State.type";

const MIN_SLOT = 0;
const MAX_SLOT = BOARD_SIZE - 1;
const MIN_OFFSET = -MAX_SLOT;
const MAX_OFFSET = MAX_SLOT;

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

const IMPLEMENTED_STATS: readonly string[] = STAT_NAMES;

/** Parameters of an ApplyStat entry; the accepted stats are `STAT_NAMES`, which grows with each stat's feature. */
export function validateStatParams(entry: { readonly stat?: unknown; readonly magnitude?: unknown; readonly duration?: unknown }): string[] {
    const errors: string[] = [];
    if (typeof entry.stat !== 'string' || !IMPLEMENTED_STATS.includes(entry.stat)) {
        errors.push(`stat must be one of ${IMPLEMENTED_STATS.join(', ')}`);
    }
    if (!Number.isInteger(entry.magnitude) || entry.magnitude === 0) errors.push('magnitude must be a non-zero integer');
    if (!Number.isInteger(entry.duration) || (entry.duration as number) < 1) errors.push('duration must be an integer >= 1');
    return errors;
}

/** Parameters of an ApplyState entry: a known state and a duration of at least one round. */
export function validateStateParams(entry: { readonly state?: unknown; readonly duration?: unknown }): string[] {
    const errors: string[] = [];
    if (typeof entry.state !== 'string' || !(STATE_NAMES as readonly string[]).includes(entry.state)) {
        errors.push(`state must be one of ${STATE_NAMES.join(', ')}`);
    }
    if (!Number.isInteger(entry.duration) || (entry.duration as number) < 1) errors.push('duration must be an integer >= 1');
    return errors;
}

export function validateEffectTargets(effect: string, groups: readonly TargetGroup[]): string[] {
    const errors: string[] = [];
    if (!Array.isArray(groups) || groups.length === 0) return ['targets must be a non-empty array'];

    groups.forEach((g, gi) => {
        const where = `group ${gi}`;
        if (g.side !== 'ALLY' && g.side !== 'ENEMY') errors.push(`${where}: side must be ALLY or ENEMY`);
        if (g.mode !== 'ABSOLUTE' && g.mode !== 'RELATIVE') errors.push(`${where}: mode must be ABSOLUTE or RELATIVE`);
        if (!Array.isArray(g.n) || g.n.length === 0) { errors.push(`${where}: n must be a non-empty array`); return; }
        const [min, max] = g.mode === 'ABSOLUTE' ? [MIN_SLOT, MAX_SLOT] : [MIN_OFFSET, MAX_OFFSET];
        for (const n of g.n) {
            if (!Number.isInteger(n)) { errors.push(`${where}: ${n} is not an integer`); continue; }
            if (n < min || n > max) errors.push(`${where}: ${n} is outside ${min}..${max}`);
        }
    });

    if (effect === EffectLabel.Swap) {
        const count = groups.reduce((acc, g) => acc + (Array.isArray(g.n) ? g.n.length : 0), 0);
        if (count !== 2) errors.push(`Swap needs exactly 2 cells, got ${count}`);
        if (new Set(groups.map(g => g.side)).size > 1) errors.push('Swap cells must all be on the same side');
    }
    return errors;
}
