import Effect from "./Effect.type";

type DieFace = {
    priority: number;
    effects: Effect[];
    description: string;
};

export default DieFace;
