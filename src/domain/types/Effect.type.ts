import GameState from "../types/GameState.type";
import Position from "../types/Position.type";
import { CharacterId } from "@shared/branded.types";

type Effect = {
    solve(gameState: GameState, targets: readonly Position[], actorId: CharacterId): { state: GameState; affected: CharacterId[] };
};

export default Effect;
