import TargetingFunction from "src/strategies/TargetType.type";
import Character from "src/types/Character.type";
import { Player } from "src/types/Player.type";
import Position from "src/types/Position.type";

export const findSingleTarget: TargetingFunction = (players: [Player, Player], position: Position): Character[] => {
    return [players[position.playerIndex].team[position.characterIndex]];
}