export type Side = 'ALLY' | 'ENEMY';
export type TargetMode = 'ABSOLUTE' | 'RELATIVE';

/**
 * A group of target cells for one effect. Side is relative to the acting
 * character's team. ABSOLUTE: n are slots (0..4). RELATIVE: n are offsets
 * added to the actor's current slot (-4..4).
 */
type TargetGroup = {
    readonly side: Side;
    readonly mode: TargetMode;
    readonly n: readonly number[];
};

export default TargetGroup;
