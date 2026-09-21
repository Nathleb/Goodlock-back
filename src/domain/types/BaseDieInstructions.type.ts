import EffectLabel from "./EffectLabels.type";
import TargetGroup from "./TargetGroup.type";

export type EffectEntry = {
    readonly effect: EffectLabel;
    readonly magnitude: number;
    readonly targets: readonly TargetGroup[];
};

export type FaceTemplate = {
    readonly description: string;
    readonly priority: number;
    readonly effects: readonly EffectEntry[];
};

export type BaseDieInstructions = readonly [FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate];
