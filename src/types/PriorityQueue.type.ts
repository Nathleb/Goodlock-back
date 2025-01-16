import Effect from "src/types/Effect.type";
import Location from "./Coordinate";

type PriorityQueue = [Effect, Location][][];

export default PriorityQueue;