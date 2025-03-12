import TargetingFunction from "../strategies/TargetType.type";
import Character from "../types/Character.type";
import { Player } from "../types/Player.type";
import Position from "../types/Position.type";

export const findSingleTarget: TargetingFunction = (players: [Player, Player], position: Position): Character[] => {
    return [players[position.playerIndex].team[position.characterIndex]];
}