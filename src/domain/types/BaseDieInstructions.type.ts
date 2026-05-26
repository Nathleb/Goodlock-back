import EffectLabel from "./EffectLabels.type";
import TargetConstraint from "./TargetConstraint.type";

export type EffectEntry = {
    effect: EffectLabel;
    magnitude: number;
};

export type FaceTemplate = {
    description: string;
    priority: number;
    effects: EffectEntry[];
    targetConstraint?: TargetConstraint;
};

export type BaseDieInstructions = [FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate];
