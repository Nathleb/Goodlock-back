import EffectLabels from "./EffectLabels.type";
import Face from "./Face.type";


export type EffectEntry = {
    effect: EffectLabels;
    magnitude: number;
    priority: number;
};

export type BaseDieInstructions = Record<Face, EffectEntry[]>;