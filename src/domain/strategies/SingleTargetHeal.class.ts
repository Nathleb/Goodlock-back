import { gainHp } from "../services/Character.service";
import { findSingleTarget } from "../services/Position.service";
import Position from "../types/Position.type";
import Effect from "../types/Effect.type";
import TargetingFunction from "./TargetType.type";
import GameState from "../types/GameState.type";
import { applyEffectToTargets } from "./TargetUtils";

export default class SingleTargetHeal implements Effect {
    readonly amount: number;
    readonly findTargets: TargetingFunction = findSingleTarget;

    constructor(amount: number) {
        this.amount = amount;
    }

    solve(gameState: GameState, target: Position, _actorId: string): GameState {
        const targetedCharacters = this.findTargets(gameState.players, target);
        const updatedPlayers = applyEffectToTargets(gameState.players, targetedCharacters, (character) => gainHp(character, this.amount));
        return { ...gameState, players: updatedPlayers };
    }
}
