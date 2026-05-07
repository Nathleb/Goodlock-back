import { gainHp } from "../services/Character.service";
import { findAdjacentTargets } from "../services/Position.service";
import Effect from "../types/Effect.type";
import Position from "../types/Position.type";
import GameState from "../types/GameState.type";
import { applyEffectToTargets } from "../utils/TargetUtils";

export default class CleaveHeal implements Effect {
    constructor(private readonly amount: number) {}

    solve(gameState: GameState, target: Position, _actorId: string): { state: GameState; affected: string[] } {
        const targets = findAdjacentTargets(gameState.players, target);
        const players = applyEffectToTargets(gameState.players, targets, c => gainHp(c, this.amount));
        return { state: { ...gameState, players }, affected: targets.map(c => c.id) };
    }
}
