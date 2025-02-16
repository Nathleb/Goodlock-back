
import Character from "src/types/Character.type";
import { Player } from "src/types/Player.type";
import Position from "src/types/Position.type";

type TargetingFunction = (players: [Player, Player], target: Position) => Character[];

export default TargetingFunction;