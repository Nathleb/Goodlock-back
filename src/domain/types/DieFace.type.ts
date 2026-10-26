import Effect from "./Effect.type";
import EffectLabel from "./EffectLabels.type";
import { StatName } from "./Modifier.type";
import { StateName } from "./State.type";
import TargetGroup from "./TargetGroup.type";

export type FaceEffect = {
    readonly label: EffectLabel;
    readonly magnitude: number;
    /** Only for ApplyStat. */
    readonly stat?: StatName;
    /** Only for ApplyState. */
    readonly state?: StateName;
    readonly duration?: number;
    readonly targets: readonly TargetGroup[];
    readonly impl: Effect;
};

type DieFace = {
    readonly priority: number;
    readonly description: string;
    readonly effects: readonly FaceEffect[];
};

export default DieFace;
