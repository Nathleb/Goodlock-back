export type TargetGroupDTO = { side: string; mode: string; n: number[] };

export type FaceEffectDTO = { effect: string; magnitude: number; targets: TargetGroupDTO[]; stat?: string; state?: string; duration?: number };

export type DieFaceDTO = {
    description: string;
    priority: number;
    effects: FaceEffectDTO[];
};
