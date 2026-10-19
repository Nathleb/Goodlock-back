export type PlayerIndex = 0 | 1;

/** Cells per side; a team of TEAM_SIZE leaves the rest empty. */
export const BOARD_SIZE = 5;
export type SlotIndex = 0 | 1 | 2 | 3 | 4;

type Position = {
    readonly playerIndex: PlayerIndex;
    readonly slot: SlotIndex;
};

export default Position;
