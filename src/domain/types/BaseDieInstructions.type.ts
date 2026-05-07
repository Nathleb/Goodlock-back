import EffectLabels from "./EffectLabels.type";

export type EffectEntry = {
    effect: EffectLabels;
    magnitude: number;
};

export type FaceTemplate = {
    description: string;
    priority: number;
    effects: EffectEntry[];
};

export type BaseDieInstructions = [FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate, FaceTemplate];
