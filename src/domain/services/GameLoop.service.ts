import GameState from "../types/GameState.type";
import GamePhase from "../types/GamePhase.type";
import { PlayerIndex } from "../types/Position.type";
import { Player } from "../types/Player.type";
import { assertPhase, beginRollPhase, beginKeepPhase, beginAssignPhase, beginResolvePhase, beginResultPhase } from "./Phase.service";
import { rollDiceForTurn, allDiceLocked } from "./Player.service";
import { addAllEffectsToPriorityQueue, unstackPriorityQueue } from "./PriorityQueue.service";

function markPlayerReady(gs: GameState, playerIndex: PlayerIndex): GameState {
    const ready: [boolean, boolean] = [gs.playersReady[0], gs.playersReady[1]];
    ready[playerIndex] = true;
    return { ...gs, playersReady: ready };
}

function resetReady(gs: GameState): GameState {
    return { ...gs, playersReady: [false, false] };
}

function areBothReady(gs: GameState): boolean {
    return gs.playersReady[0] && gs.playersReady[1];
}

function rerollBothPlayers(gs: GameState): GameState {
    const players: [Player, Player] = [
        rollDiceForTurn(gs.players[0]),
        rollDiceForTurn(gs.players[1]),
    ];
    return { ...gs, players };
}

export function confirmPlacement(gs: GameState, playerIndex: PlayerIndex): GameState {
    assertPhase(gs, GamePhase.PLACEMENT);
    const updated = markPlayerReady(gs, playerIndex);
    if (!areBothReady(updated)) return updated;
    return resetReady(beginRollPhase(updated));
}

export function performRoll(gs: GameState): GameState {
    assertPhase(gs, GamePhase.ROLL);
    return resetReady(beginKeepPhase(rerollBothPlayers(gs)));
}

export function confirmKeep(gs: GameState, playerIndex: PlayerIndex): GameState {
    assertPhase(gs, GamePhase.KEEP);
    const updated = markPlayerReady(gs, playerIndex);
    if (!areBothReady(updated)) return updated;

    const bothLocked = allDiceLocked(updated.players[0]) && allDiceLocked(updated.players[1]);
    if (updated.rollsLeft === 0 || bothLocked) {
        return resetReady(beginAssignPhase(updated));
    }

    return resetReady({ ...rerollBothPlayers(updated), rollsLeft: updated.rollsLeft - 1 });
}

export function confirmAssignment(gs: GameState, playerIndex: PlayerIndex): GameState {
    assertPhase(gs, GamePhase.ASSIGN);
    const updated = markPlayerReady(gs, playerIndex);
    if (!areBothReady(updated)) return updated;
    return resetReady(beginResolvePhase(updated));
}

export function performResolve(gs: GameState): GameState {
    assertPhase(gs, GamePhase.RESOLVE);
    const withQueue = addAllEffectsToPriorityQueue(gs);
    const resolved = unstackPriorityQueue(withQueue);
    return beginResultPhase(resolved);
}
