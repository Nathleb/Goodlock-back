import EffectLabel from "./EffectLabels.type";
import TargetConstraint from "./TargetConstraint.type";

export type EffectEntry = {
    readonly effect: EffectLabel;
    readonly magnitude: number;
};

export type FaceTemplate = {
    readonly description: string;
    readonly priority: number;
    readonly effects: readonly EffectEntry[];
    readonly targetConstraint?: TargetConstraint;
};

export type BaseDieInstructions = readonly [FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate];
