import Character from "../types/Character.type";
import { isDead, rollForTurn, setTarget, toggleIsFaceLocked, rollDie } from "./Character.service";
import { Player } from "../types/Player.type";
import Position, { SlotIndex, PlayerIndex } from "../types/Position.type";
import GameState from "../types/GameState.type";

export enum SwapDirection {
    LEFT  = "left",
    RIGHT = "right",
}

export function toggleDieLockForCharacter(player: Player, position: Position): Player {
    const newTeam = player.team.map((char, index) =>
        index === position.slot ? toggleIsFaceLocked(char) : char
    );
    return { ...player, team: newTeam };
}

export function selectTargetOfCharacter(player: Player, slot: SlotIndex, target: Position): Player {
    const newTeam = player.team.map((char) =>
        char.position.slot === slot ? setTarget(char, target) : char
    );
    return { ...player, team: newTeam };
}

export function rollDiceForTurn(player: Player): Player {
    const newTeam = player.team.map(char => rollForTurn(char));
    return { ...player, team: newTeam };
}

export function unlockAllDice(player: Player): Player {
    const newTeam = player.team.map(char => char.isFaceLocked ? toggleIsFaceLocked(char) : char);
    return { ...player, team: newTeam };
}

export function allDiceLocked(player: Player): boolean {
    return player.team.every(char => char.isFaceLocked);
}

export function hasLost(player: Player): boolean {
    return player.team.filter(char => isDead(char)).length >= 3;
}

export function rollDieFromPlayer(player: Player, position: Position): Player {
    const newTeam = player.team.map((char, index) =>
        index === position.slot ? rollDie(char) : char
    );
    return { ...player, team: newTeam };
}

export function rearrangeTeam(player: Player, order: SlotIndex[]): Player {
    const newTeam = order.map((fromSlot, toSlot) => ({
        ...player.team[fromSlot],
        position: { ...player.team[fromSlot].position, slot: toSlot as SlotIndex },
    }));
    return { ...player, team: newTeam };
}

export function createPlayer(team: Character[], playerIndex: PlayerIndex): Player {
    const positioned = team.map((char, index) => ({
        ...char,
        position: { playerIndex, slot: index as SlotIndex },
        face: char.baseDie[0],
    }));
    return { playerIndex, team: positioned };
}

export function canSwap(player: Player, slot: SlotIndex, direction: SwapDirection): boolean {
    if (direction === SwapDirection.LEFT) return slot > 0;
    return slot < player.team.length - 1;
}

export function executeSwap(gameState: GameState, characterId: string, direction: SwapDirection): GameState {
    const updatedPlayers = gameState.players.map(player => {
        const idx = player.team.findIndex(c => c.id === characterId);
        if (idx === -1) return player;

        const neighborIdx = direction === SwapDirection.LEFT ? idx - 1 : idx + 1;
        if (neighborIdx < 0 || neighborIdx >= player.team.length) return player;

        const newTeam = [...player.team];
        newTeam[idx] = { ...player.team[neighborIdx], position: { ...player.team[neighborIdx].position, slot: idx as SlotIndex } };
        newTeam[neighborIdx] = { ...player.team[idx], position: { ...player.team[idx].position, slot: neighborIdx as SlotIndex } };

        return { ...player, team: newTeam };
    }) as [Player, Player];

    return { ...gameState, players: updatedPlayers };
}
