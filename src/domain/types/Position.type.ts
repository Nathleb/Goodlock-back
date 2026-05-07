export type PlayerIndex = 0 | 1;
export type SlotIndex = number;

type Position = {
    playerIndex: PlayerIndex;
    slot: SlotIndex;
};

export default Position;
