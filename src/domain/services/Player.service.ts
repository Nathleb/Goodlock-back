import Character from "../types/Character.type";
import { isDead, rollForTurn, rollDie } from "./Character.service";
import { Player } from "../types/Player.type";
import Position, { BOARD_SIZE, SlotIndex, PlayerIndex } from "../types/Position.type";

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

/** Dead characters that lose the match (out of TEAM_SIZE). */
export const LOSS_DEATHS = 2;

export function hasLost(player: Player): boolean {
    return player.team.filter(char => isDead(char)).length >= LOSS_DEATHS;
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

/**
 * Lays the team out on the board: `slots` reads like the board (BOARD_SIZE
 * cells), each team character exactly once, `null` for the empty cells.
 * The returned team is ordered by slot.
 */
export function placeTeam(player: Player, slots: readonly (string | null)[]): Player {
    if (!Array.isArray(slots) || slots.length !== BOARD_SIZE) {
        throw new Error(`Placement must list exactly ${BOARD_SIZE} cells`);
    }
    const ids = slots.filter(s => s !== null);
    if (ids.some(id => typeof id !== 'string')) throw new Error('Placement cells must be character IDs or null');
    if (ids.length !== player.team.length) {
        throw new Error(`Placement must leave exactly ${BOARD_SIZE - player.team.length} empty cell(s)`);
    }
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate character IDs in placement');

    const team = slots.flatMap((id, slot) => {
        if (id === null) return [];
        const char = player.team.find(c => c.id === id);
        if (!char) throw new Error('Unknown character ID in placement');
        return [{ ...char, position: { ...char.position, slot: slot as SlotIndex } }];
    });
    return { ...player, team };
}

export function createPlayer(team: Character[], playerIndex: PlayerIndex): Player {
    const positioned = team.map((char, index) => ({
        ...char,
        position: { playerIndex, slot: index as SlotIndex },
        face: char.baseDie[0],
    }));
    return { playerIndex, team: positioned };
}


