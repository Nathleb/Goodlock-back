type TargetGroupDTO = { side: string; mode: string; n: number[] };

/** One thing an effect does to its cells. */
type FacePartDTO = { part: string; magnitude: number; stat?: string; state?: string; duration?: number };

/** One step of a face: its target cells and its parts, in order. */
type FaceEffectDTO = { targets: TargetGroupDTO[]; parts: FacePartDTO[] };

export type DieFaceDTO = {
    description: string;
    priority: number;
    effects: FaceEffectDTO[];
};
