/** Where the dice come from. The domain draws through it and never calls a random function itself. */
export interface DiceSource {
    /** Draws an index in `0..size-1`, every index equally likely for a fair source. */
    roll(size: number): number;
}
