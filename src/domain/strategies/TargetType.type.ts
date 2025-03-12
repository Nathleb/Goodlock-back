
import Character from "../types/Character.type";
import { Player } from "../types/Player.type";
import Position from "../types/Position.type";

type TargetingFunction = (players: [Player, Player], target: Position) => Character[];

export default TargetingFunction;