import { gainShield } from "../services/Character.service";
import { findAdjacentTargets } from "../services/Position.service";
import { applyEffectToTargets } from "./TargetUtils";
import Effect from "../types/Effect.type";
import GameState from "../types/GameState.type";
import Position from "../types/Position.type";
import TargetingFunction from "./TargetType.type";

export default class CleaveShield implements Effect {
    readonly amount: number;
    readonly findTargets: TargetingFunction = findAdjacentTargets;

    constructor(amount: number) {
        this.amount = amount;
    }

    solve(gameState: GameState, target: Position, _actorId: string): GameState {
        const targets = this.findTargets(gameState.players, target);
        return { ...gameState, players: applyEffectToTargets(gameState.players, targets, c => gainShield(c, this.amount)) };
    }
}
