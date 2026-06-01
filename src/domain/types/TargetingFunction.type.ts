import Character from "./Character.type";
import { Player } from "./Player.type";
import Position from "./Position.type";

type TargetingFunction = (players: readonly [Player, Player], target: Position) => Character[];

export default TargetingFunction;