import { dealDamage } from "../services/Character.service";
import { findFullTeam } from "../services/Position.service";
import { applyEffectToTargets } from "../utils/TargetUtils";
import Effect from "../types/Effect.type";
import GameState from "../types/GameState.type";
import Position from "../types/Position.type";
import TargetingFunction from "../types/TargetingFunction.type";

export default class FullTeamDamage implements Effect {
    readonly amount: number;
    readonly findTargets: TargetingFunction = findFullTeam;

    constructor(amount: number) {
        this.amount = amount;
    }

    solve(gameState: GameState, target: Position, _actorId: string): GameState {
        const targets = this.findTargets(gameState.players, target);
        return { ...gameState, players: applyEffectToTargets(gameState.players, targets, c => dealDamage(c, this.amount)) };
    }
}
