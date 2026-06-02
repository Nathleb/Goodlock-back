import Character from "../types/Character.type";
import { isDead, rollForTurn, setTarget, rollDie } from "./Character.service";
import { Player } from "../types/Player.type";
import Position, { SlotIndex, PlayerIndex } from "../types/Position.type";
import { validateTarget } from "./TargetValidator";

export function selectTargetOfCharacter(player: Player, slot: SlotIndex, target: Position): Player {
    const char = player.team.find(c => c.position.slot === slot);
    if (!char) return player;
    validateTarget(char.face.targetConstraint, player.playerIndex, target);
    const newTeam = player.team.map((c) =>
        c.position.slot === slot ? setTarget(c, target) : c
    );
    return { ...player, team: newTeam };
}

export function rollDiceForTurn(player: Player): Player {
    const newTeam = player.team.map(char => rollForTurn(char));
    return { ...player, team: newTeam };
}

export function unlockAllDice(player: Player): Player {
    return { ...player, team: player.team.map(c => ({ ...c, isFaceLocked: false })) };
}

export function allDiceLocked(player: Player): boolean {
    return player.team.every(char => char.isFaceLocked);
}

export function hasLost(player: Player): boolean {
    return player.team.filter(char => isDead(char)).length >= 3;
}

export function rollDieFromPlayer(player: Player, position: Position): Player {
    const newTeam = player.team.map(char =>
        char.position.slot === position.slot ? rollDie(char) : char
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


