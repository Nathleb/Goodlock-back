export function roll1D6(): number {
    return roll1D(6);
}

export function roll1D(size: number): number {
    return Math.floor(Math.random() * size);
}
