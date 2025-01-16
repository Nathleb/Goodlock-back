import Character from "src/types/Character.type";
import Player from "src/types/Player.type";
import Position from "src/types/Position.type";
import Location from "src/types/Coordinate";
import { isDead, rollForTurn, setCurrentTarget, toggleIsFaceLocked, rollDie } from "./Character.service";

export function createPlayer(team: Character[]): Player {
    return {
        team: team
    };
}

export function toggleDieLockForCharacter(player: Player, position: Position): void {
    toggleIsFaceLocked(player.team[position]);
}

export function selectCurrentTargetOfCharacter(player: Player, position: Position, target: Location): void {
    setCurrentTarget(player.team[position], target);
}

export function rollDiceForTurn(player: Player): void {
    player.team.forEach(char => rollForTurn(char));
}

export function hasLost(player: Player): boolean {
    return player.team.some(char => !isDead(char));
}

export function rollDieFromPlayer(player: Player, position: Position) {
    rollDie(player.team[position]);
}