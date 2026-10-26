/** Stats with a magnitude. Each stat is added by its own feature; the validator and the DTO read this list. */
export const STAT_NAMES = ['POWER', 'ARMOR'] as const;
export type StatName = typeof STAT_NAMES[number];

/** One application of a stat: magnitude and duration are authored independently. */
type Modifier = {
    readonly stat: StatName;
    readonly value: number;
    readonly roundsLeft: number;
    /** Round during which it was applied: it does not tick at the end of that round. */
    readonly appliedRound: number;
};

export default Modifier;
