import CharacterIndex from "./CharacterIndex.type";
import PlayerIndex from "./PlayerIndex.type";

type Position = {
    playerIndex: PlayerIndex,
    characterIndex: CharacterIndex
};

export default Position;