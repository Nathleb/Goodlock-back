import GameState from "../types/GameState.type";
import { Player } from "../types/Player.type";
import { gainHp, loseHp, stateValue } from "./Character.service";

/** Hit points lost by a poisoned character at the start of each round. */
export const POISON_DAMAGE = 5;
/** Hit points regained by a regenerating character at the start of each round. */
export const REGEN_HEAL = 5;

/**
 * Start of the round, before the ROLL: POISON hurts and REGEN heals. The counters are
 * not touched here, they tick at the end of the round.
 */
export function upkeep(gameState: GameState): GameState {
    const players = gameState.players.map(player => ({
        ...player,
        team: player.team.map(c => {
            const vitality = stateValue(c, 'VITALITY');
            // POISON is a plain HP loss: ARMOR, the armour shield and DIVINE_SHIELD do not apply to it.
            if (vitality < 0) return loseHp(c, POISON_DAMAGE);
            // gainHp caps at max HP and never revives.
            if (vitality > 0) return gainHp(c, REGEN_HEAL);
            return c;
        }),
    })) as unknown as [Player, Player];
    return { ...gameState, players };
}
