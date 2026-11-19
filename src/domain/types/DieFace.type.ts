import EffectLabel from "./EffectLabels.type";
import { StatName } from "./Modifier.type";
import { StateName } from "./State.type";
import TargetGroup from "./TargetGroup.type";

/** One thing an effect does to its cells. */
export type FacePart = {
    readonly label: EffectLabel;
    readonly magnitude: number;
    /** Only for ApplyStat. */
    readonly stat?: StatName;
    /** Only for ApplyState. */
    readonly state?: StateName;
    readonly duration?: number;
};

/** One step of a face: its target cells and the parts applied to them, in order. */
export type FaceEffect = {
    readonly targets: readonly TargetGroup[];
    readonly parts: readonly FacePart[];
};

type DieFace = {
    readonly priority: number;
    readonly description: string;
    readonly effects: readonly FaceEffect[];
};

export default DieFace;
