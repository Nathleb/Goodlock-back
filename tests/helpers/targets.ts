import TargetGroup from "@domain/types/TargetGroup.type";

export const enemyAbs = (...n: number[]): TargetGroup => ({ side: 'ENEMY', mode: 'ABSOLUTE', n });
export const allyAbs  = (...n: number[]): TargetGroup => ({ side: 'ALLY',  mode: 'ABSOLUTE', n });
export const enemyRel = (...n: number[]): TargetGroup => ({ side: 'ENEMY', mode: 'RELATIVE', n });
export const allyRel  = (...n: number[]): TargetGroup => ({ side: 'ALLY',  mode: 'RELATIVE', n });
