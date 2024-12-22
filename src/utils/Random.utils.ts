import Position from "src/types/Position.type";


//0 to 5
export function roll1D6() {
    return Math.floor(Math.random() * 6);
}

export function roll1D5(): Position {
    return Math.floor(Math.random() * 5) as Position;
}