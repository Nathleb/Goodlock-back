import Character from "../types/Character.type";
import { isDead, rollForTurn, rollDie } from "./Character.service";
import { Player } from "../types/Player.type";
import Position, { BOARD_SIZE, SlotIndex, PlayerIndex } from "../types/Position.type";
import { DomainError, domainError } from "../errors/DomainError";
import { Result, ok, err } from "@shared/result.type";

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

/**
 * Lays the team out on the board: `slots` reads like the board (BOARD_SIZE
 * cells), each team character exactly once, `null` for the empty cells.
 * The returned team is ordered by slot.
 */
export function placeTeam(player: Player, slots: readonly (string | null)[]): Result<Player, DomainError> {
    const invalid = (message: string) => err(domainError('INVALID_PLACEMENT', message));
    if (!Array.isArray(slots) || slots.length !== BOARD_SIZE) {
        return invalid(`Placement must list exactly ${BOARD_SIZE} cells`);
    }
    const ids = slots.filter(s => s !== null);
    if (ids.some(id => typeof id !== 'string')) return invalid('Placement cells must be character IDs or null');
    if (ids.length !== player.team.length) {
        return invalid(`Placement must leave exactly ${BOARD_SIZE - player.team.length} empty cell(s)`);
    }
    if (new Set(ids).size !== ids.length) return invalid('Duplicate character IDs in placement');

    const team: Character[] = [];
    for (const [slot, id] of slots.entries()) {
        if (id === null) continue;
        const char = player.team.find(c => c.id === id);
        if (!char) return invalid('Unknown character ID in placement');
        team.push({ ...char, position: { ...char.position, slot: slot as SlotIndex } });
    }
    return ok({ ...player, team });
}

export function createPlayer(team: Character[], playerIndex: PlayerIndex): Player {
    const positioned = team.map((char, index) => ({
        ...char,
        position: { playerIndex, slot: index as SlotIndex },
        face: char.baseDie[0],
    }));
    return { playerIndex, team: positioned };
}


