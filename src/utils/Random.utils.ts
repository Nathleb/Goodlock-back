import Position from "src/types/Position.type";


//0 to 5
export function roll1D6() {
    return roll1D(6);
}

export function rollRandomPosition(): Position {
    return roll1D(5) as Position;
}

export function roll1D(size: number) {
    return Math.floor(Math.random() * size);
};