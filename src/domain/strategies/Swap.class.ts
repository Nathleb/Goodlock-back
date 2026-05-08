import { executeSwap, SwapDirection } from "../services/Player.service";
import Effect from "../types/Effect.type";
import GameState from "../types/GameState.type";
import Position from "../types/Position.type";

export default class SwapEffect implements Effect {
    constructor(private readonly direction: SwapDirection) {}

    solve(gameState: GameState, _target: Position, actorId: string): { state: GameState; affected: string[] } {
        const affected: string[] = [];

        for (const player of gameState.players) {
            const idx = player.team.findIndex(c => c.id === actorId);
            if (idx === -1) continue;
            const neighborIdx = this.direction === SwapDirection.LEFT ? idx - 1 : idx + 1;
            if (neighborIdx >= 0 && neighborIdx < player.team.length) {
                affected.push(actorId, player.team[neighborIdx].id);
            }
        }

        return { state: executeSwap(gameState, actorId, this.direction), affected };
    }
}
