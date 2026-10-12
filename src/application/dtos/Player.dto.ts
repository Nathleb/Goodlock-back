export type PlayerDTO = {
    playerId: string;
    isOwner: boolean;
    /** Has chosen a deck for the next match (the deck itself is revealed only at team preview). */
    hasDeck: boolean;
}
