import GameState from "../types/GameState.type";
import Character from "../types/Character.type";
import { gainHp, loseHp, stateValue } from "./Character.service";
import { applyAtPositions } from "../utils/TargetUtils";
import { startOfRoundOrder } from "./PriorityQueue.service";
import { checkMatchEnd } from "./Round.service";

/** Hit points lost by a poisoned character at the start of each round. */
export const POISON_DAMAGE = 5;
/** Hit points regained by a regenerating character at the start of each round. */
export const REGEN_HEAL = 5;

/**
 * Start of the round, before the ROLL (UPK-1): POISON hurts and REGEN heals, one character at a
 * time in the order of the resolution without the bracket. Deaths are checked after each one
 * (END-2), and the first player to have 2 dead characters loses. The counters are not touched
 * here, they tick at the end of the round.
 */
export function upkeep(gameState: GameState): GameState {
    let state = gameState;
    for (const id of startOfRoundOrder(gameState)) {
        const character = state.players.flatMap(p => p.team).find(c => c.id === id)!;
        const vitality = stateValue(character, 'VITALITY');
        if (vitality === 0) continue;
        // POISON is a plain HP loss: ARMOR, the armour shield and DIVINE_SHIELD do not apply to it.
        // gainHp caps at max HP. A character the poison kills leaves the board (DEAD-1).
        const change = (c: Character) => vitality < 0 ? loseHp(c, POISON_DAMAGE) : gainHp(c, REGEN_HEAL);
        state = applyAtPositions(state, [character.position], change).state;
        state = checkMatchEnd(state, character.position.playerIndex);
        if (state.winner !== undefined) break;
    }
    return state;
}
