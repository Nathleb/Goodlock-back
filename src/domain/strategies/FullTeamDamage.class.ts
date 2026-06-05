import { dealDamage } from "../services/Character.service";
import Effect from "../types/Effect.type";
import Position, { PlayerIndex } from "../types/Position.type";
import GameState from "../types/GameState.type";
import { applyEffectToTargets } from "../utils/TargetUtils";

export default class FullTeamDamage implements Effect {
    constructor(private readonly amount: number) {}

    // Damage-all always hits the opponent's team, derived from the actor — never
    // the supplied target. This keeps it correct under a NONE constraint, where
    // resolution passes the actor's own position as the target.
    solve(gameState: GameState, _target: Position, actorId: string): { state: GameState; affected: string[] } {
        const actorIndex = gameState.players.findIndex(p => p.team.some(c => c.id === actorId));
        if (actorIndex === -1) return { state: gameState, affected: [] };
        const enemyIndex = (1 - actorIndex) as PlayerIndex;
        const targets = [...gameState.players[enemyIndex].team];
        const players = applyEffectToTargets(gameState.players, targets, c => dealDamage(c, this.amount));
        return { state: { ...gameState, players }, affected: targets.map(c => c.id) };
    }
}
