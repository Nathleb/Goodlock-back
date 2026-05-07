import EffectLabel from "./EffectLabels.type";

export type EffectEntry = {
    effect: EffectLabel;
    magnitude: number;
};

export type FaceTemplate = {
    description: string;
    priority: number;
    effects: EffectEntry[];
};

export type BaseDieInstructions = [FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate];
