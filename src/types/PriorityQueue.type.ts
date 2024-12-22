import Effect from "src/types/Effect.type";
import Target from "./Target.type";

type PriorityQueue = [Effect, Target][][];

export default PriorityQueue;