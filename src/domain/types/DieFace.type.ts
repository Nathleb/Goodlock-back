import Effect from "./Effect.type";
import TargetConstraint from "./TargetConstraint.type";

type DieFace = {
    readonly priority: number;
    readonly effects: readonly Effect[];
    readonly description: string;
    readonly targetConstraint: TargetConstraint;
};

export default DieFace;
