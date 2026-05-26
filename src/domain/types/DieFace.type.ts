import Effect from "./Effect.type";
import TargetConstraint from "./TargetConstraint.type";

type DieFace = {
    priority: number;
    effects: Effect[];
    description: string;
    targetConstraint: TargetConstraint;
};

export default DieFace;
