import EffectLabel from "./EffectLabels.type";
import { StatName } from "./Modifier.type";
import { StateName } from "./State.type";
import TargetGroup from "./TargetGroup.type";

type BasicEffectEntry = {
    readonly effect: Exclude<EffectLabel, EffectLabel.ApplyStat | EffectLabel.ApplyState>;
    readonly magnitude: number;
    readonly targets: readonly TargetGroup[];
};

/** Adds a stat instance: `magnitude` is the stat value (negative = debuff), `duration` is in rounds. */
type ApplyStatEntry = {
    readonly effect: EffectLabel.ApplyStat;
    readonly stat: StatName;
    readonly magnitude: number;
    readonly duration: number;
    readonly targets: readonly TargetGroup[];
};

/** Puts a state on its axis: no magnitude, `duration` is in rounds. */
type ApplyStateEntry = {
    readonly effect: EffectLabel.ApplyState;
    readonly state: StateName;
    readonly duration: number;
    readonly targets: readonly TargetGroup[];
};

export type EffectEntry = BasicEffectEntry | ApplyStatEntry | ApplyStateEntry;

type FaceTemplate = {
    readonly description: string;
    readonly priority: number;
    readonly effects: readonly EffectEntry[];
};

export type BaseDieInstructions = readonly [FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate];
