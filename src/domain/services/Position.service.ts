import TargetingFunction from "../types/TargetingFunction.type";
import Character from "../types/Character.type";
import { Player } from "../types/Player.type";
import Position from "../types/Position.type";

export const findSingleTarget: TargetingFunction = (players: [Player, Player], position: Position): Character[] => {
    const char = players[position.playerIndex].team.find(c => c.position.slot === position.slot);
    return char ? [char] : [];
};

export const findAdjacentTargets: TargetingFunction = (players: [Player, Player], position: Position): Character[] => {
    return players[position.playerIndex].team.filter(c => Math.abs(c.position.slot - position.slot) <= 1);
};

export const findFullTeam: TargetingFunction = (players: [Player, Player], position: Position): Character[] => {
    return [...players[position.playerIndex].team];
};

export function findSelf(players: readonly [Player, Player], actorId: string): Character[] {
    for (const player of players) {
        const char = player.team.find(c => c.id === actorId);
        if (char) return [char];
    }
    return [];
}