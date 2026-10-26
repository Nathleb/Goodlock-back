import { dealDamage, netStat } from "../services/Character.service";
import Position from "../types/Position.type";
import GameState from "../types/GameState.type";
import { applyAtPositions } from "../utils/TargetUtils";
import Effect from "../types/Effect.type";

export default class Damage implements Effect {
    constructor(private readonly amount: number) {}

    solve(gameState: GameState, targets: readonly Position[], actorId: string): { state: GameState; affected: string[] } {
        const actor = gameState.players.flatMap(p => p.team).find(c => c.id === actorId);
        const power = actor ? netStat(actor, 'POWER') : 0;
        // Read on each target cell, so an area pattern is reduced cell by cell.
        return applyAtPositions(gameState, targets, c => dealDamage(c, Math.max(0, this.amount + power - netStat(c, 'ARMOR'))));
    }
}
