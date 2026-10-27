/** Axes of a state: each holds one signed counter, which is the duration. */
export const STATE_AXES = ['SPEED', 'VITALITY', 'STUN', 'ROOT', 'DIVINE_SHIELD'] as const;
export type StateAxis = typeof STATE_AXES[number];

/** Each state sits on an axis; `sign` is the direction it pushes the counter (a buff and its inverse fight over the duration). */
export const STATE_DEFS = {
    HASTE:         { axis: 'SPEED',         sign: 1 },
    SLOW:          { axis: 'SPEED',         sign: -1 },
    REGEN:         { axis: 'VITALITY',      sign: 1 },
    POISON:        { axis: 'VITALITY',      sign: -1 },
    STUN:          { axis: 'STUN',          sign: 1 },
    ROOT:          { axis: 'ROOT',          sign: 1 },
    DIVINE_SHIELD: { axis: 'DIVINE_SHIELD', sign: 1 },
} as const satisfies Record<string, { axis: StateAxis; sign: 1 | -1 }>;

export type StateName = keyof typeof STATE_DEFS;
export const STATE_NAMES = Object.keys(STATE_DEFS) as StateName[];

/** `touchedRound` is the last round the axis was changed: it does not tick at the end of that round. */
export type StateCounter = { readonly value: number; readonly touchedRound: number };
export type CharacterStates = Readonly<Partial<Record<StateAxis, StateCounter>>>;
