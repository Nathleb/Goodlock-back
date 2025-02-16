import { gainShield } from "src/services/Character.service";
import { findSingleTarget } from "src/services/Position.service";
import Effect from "../types/Effect.type";
import TargetingFunction from "./TargetType.type";
import { Player } from "src/types/Player.type";
import Position from "src/types/Position.type";


export default class SingleTargetShield implements Effect {
    readonly priority: number;
    readonly amount: number;
    readonly findTargets: TargetingFunction = findSingleTarget;

    constructor(amount: number, priority: number) {
        this.priority = priority;
        this.amount = amount;
    }

    solve(gameState: GameState, target: Position): GameState {
        const targetedCharacters = this.findTargets(gameState.players, target);

        const updatedPlayers = gameState.players.map((player) => {
            const updatedTeam = player.team.map((character) => {
                if (targetedCharacters.includes(character)) {
                    return gainShield(character, this.amount);
                }
                return character;
            });
            return { ...player, team: updatedTeam };
        }) as [Player, Player];

        return { ...gameState, players: updatedPlayers };
    }
}
