export type PlayerIndex = 0 | 1;
export type SlotIndex = 0 | 1 | 2 | 3 | 4;

type Position = {
    readonly playerIndex: PlayerIndex;
    readonly slot: SlotIndex;
};

export default Position;
