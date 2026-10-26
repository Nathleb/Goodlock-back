import EffectLabel from "./EffectLabels.type";
import { StatName } from "./Modifier.type";
import TargetGroup from "./TargetGroup.type";

export type BasicEffectEntry = {
    readonly effect: Exclude<EffectLabel, EffectLabel.ApplyStat>;
    readonly magnitude: number;
    readonly targets: readonly TargetGroup[];
};

/** Adds a stat instance: `magnitude` is the stat value (negative = debuff), `duration` is in rounds. */
export type ApplyStatEntry = {
    readonly effect: EffectLabel.ApplyStat;
    readonly stat: StatName;
    readonly magnitude: number;
    readonly duration: number;
    readonly targets: readonly TargetGroup[];
};

export type EffectEntry = BasicEffectEntry | ApplyStatEntry;

export type FaceTemplate = {
    readonly description: string;
    readonly priority: number;
    readonly effects: readonly EffectEntry[];
};

export type BaseDieInstructions = readonly [FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate];
