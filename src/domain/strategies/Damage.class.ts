import { dealDamage, netStat } from "../services/Character.service";
import Position from "../types/Position.type";
import GameState from "../types/GameState.type";
import { applyAtPositions } from "../utils/TargetUtils";
import Effect from "../types/Effect.type";

export default class Damage implements Effect {
    constructor(private readonly amount: number) {}

    solve(gameState: GameState, targets: readonly Position[], actorId: string): { state: GameState; affected: string[] } {
        const actor = gameState.players.flatMap(p => p.team).find(c => c.id === actorId);
        const amount = this.amount + (actor ? netStat(actor, 'POWER') : 0);
        return applyAtPositions(gameState, targets, c => dealDamage(c, amount));
    }
}
