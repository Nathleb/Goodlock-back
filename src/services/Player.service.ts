import Character from "src/types/Character.type";
import { isDead, rollForTurn, setCurrentTarget, toggleIsFaceLocked, rollDie } from "./Character.service";


export function toggleDieLockForCharacter(player: Player, position: Position): void {
    toggleIsFaceLocked(player.team[position]);
}

export function selectCurrentTargetOfCharacter(player: Player, position: Position, target: Position): void {
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