import Effect from "./Effect.type";
import EffectLabel from "./EffectLabels.type";
import TargetGroup from "./TargetGroup.type";

export type FaceEffect = {
    readonly label: EffectLabel;
    readonly magnitude: number;
    readonly targets: readonly TargetGroup[];
    readonly impl: Effect;
};

type DieFace = {
    readonly priority: number;
    readonly description: string;
    readonly effects: readonly FaceEffect[];
};

export default DieFace;
