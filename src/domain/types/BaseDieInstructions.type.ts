import EffectLabel from "./EffectLabels.type";
import { StatName } from "./Modifier.type";
import { StateName } from "./State.type";
import TargetGroup from "./TargetGroup.type";

type BasicPartEntry = {
    readonly part: Exclude<EffectLabel, EffectLabel.ApplyStat | EffectLabel.ApplyState>;
    readonly magnitude: number;
};

/** Adds a stat instance: `magnitude` is the stat value (negative = debuff), `duration` is in rounds. */
type ApplyStatEntry = {
    readonly part: EffectLabel.ApplyStat;
    readonly stat: StatName;
    readonly magnitude: number;
    readonly duration: number;
};

/** Puts a state on its axis: no magnitude, `duration` is in rounds. */
type ApplyStateEntry = {
    readonly part: EffectLabel.ApplyState;
    readonly state: StateName;
    readonly duration: number;
};

export type PartEntry = BasicPartEntry | ApplyStatEntry | ApplyStateEntry;

/** One step of a face as authored: its target cells and the parts applied to them, in order. */
export type EffectEntry = {
    readonly targets: readonly TargetGroup[];
    readonly parts: readonly PartEntry[];
};

type FaceTemplate = {
    readonly description: string;
    readonly priority: number;
    readonly effects: readonly EffectEntry[];
};

export type BaseDieInstructions = readonly [FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate];
