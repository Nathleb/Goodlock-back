import { gainShield } from "../services/Character.service";
import Position from "../types/Position.type";
import GameState from "../types/GameState.type";
import { applyAtPositions } from "../utils/TargetUtils";
import Effect from "../types/Effect.type";
import { CharacterId } from "@shared/branded.types";

export default class Shield implements Effect {
    constructor(private readonly amount: number) {}

    solve(gameState: GameState, targets: readonly Position[], _actorId: CharacterId): { state: GameState; affected: CharacterId[] } {
        return applyAtPositions(gameState, targets, c => gainShield(c, this.amount));
    }
}
