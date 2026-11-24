import { DiceSource } from '@domain/types/DiceSource.type';

/** Dice that land where the script says, for tests that need to impose the faces drawn. */
export class ScriptedDiceSource implements DiceSource {
    /** The size of every draw made so far. */
    readonly sizes: number[] = [];
    private readonly queue: number[];

    /**
     * Draws the given indices in order. Once they are used up, `then` is drawn every time
     * (`'last'` is the last index of whatever size is drawn); without it, another draw is refused.
     */
    constructor(indices: readonly number[], private readonly then?: number | 'last') {
        this.queue = [...indices];
    }

    /** Every draw lands on `index`, or on the last index of its size. */
    static always(index: number | 'last'): ScriptedDiceSource {
        return new ScriptedDiceSource([], index);
    }

    roll(size: number): number {
        this.sizes.push(size);
        const next = this.queue.length > 0 ? this.queue.shift() : this.then;
        if (next === undefined) throw new Error('ScriptedDiceSource: the script is used up');
        const index = next === 'last' ? size - 1 : next;
        if (!Number.isInteger(index) || index < 0 || index >= size) {
            throw new Error(`ScriptedDiceSource: index ${index} is outside 0..${size - 1}`);
        }
        return index;
    }
}
