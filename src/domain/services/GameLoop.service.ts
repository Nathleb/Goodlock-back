import GameState from "../types/GameState.type";
import GamePhase from "../types/GamePhase.type";
import { PlayerIndex } from "../types/Position.type";
import { Player } from "../types/Player.type";
import { assertPhase, assertNotReady, checkPhase, checkNotReady, beginPlacementPhase, beginRollPhase, beginKeepPhase, beginResolvePhase, beginResultPhase } from "./Phase.service";
import { rollDiceForTurn, allDiceLocked, createPlayer } from "./Player.service";
import { ResolveStep } from "../types/PriorityQueue.type";
import { addAllEffectsToPriorityQueue, unstackPriorityQueueWithLog, createPriorityQueue } from "./PriorityQueue.service";
import { TEAM_SIZE } from "./Deck.service";
import CharacterTemplate from "../types/CharacterTemplate.type";
import Character from "../types/Character.type";
import { CatalogId } from "@shared/branded.types";
import { roll1D } from "../utils/Random.utils";
import { DomainError } from "../errors/DomainError";
import { Result } from "@shared/result.type";

function markPlayerReady(gs: GameState, playerIndex: PlayerIndex): GameState {
    const ready: [boolean, boolean] = [gs.playersReady[0], gs.playersReady[1]];
    ready[playerIndex] = true;
    return { ...gs, playersReady: ready };
}

function unmarkPlayerReady(gs: GameState, playerIndex: PlayerIndex): GameState {
    const ready: [boolean, boolean] = [gs.playersReady[0], gs.playersReady[1]];
    ready[playerIndex] = false;
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

export function createSelectionState(decks: readonly [readonly CharacterTemplate[], readonly CharacterTemplate[]]): GameState {
    return {
        phase: GamePhase.SELECTION,
        currentRound: 0,
        initiativePlayerIndex: roll1D(2) as PlayerIndex,
        rollsLeft: 2,
        playersReady: [false, false],
        priorityQueue: createPriorityQueue(),
        players: [createPlayer([], 0), createPlayer([], 1)],
        selection: { decks, picks: [null, null] },
    };
}

function assertValidPick(deck: readonly CharacterTemplate[], picks: readonly CatalogId[]): void {
    if (picks.length !== TEAM_SIZE) throw new Error(`Pick exactly ${TEAM_SIZE} characters (got ${picks.length})`);
    if (new Set(picks).size !== picks.length) throw new Error('A character can only be picked once');
    const own = new Set(deck.map(t => t.id));
    const foreign = picks.filter(id => !own.has(id));
    if (foreign.length > 0) throw new Error(`Not in your deck: ${foreign.join(', ')}`);
}

/**
 * Secretly keeps TEAM_SIZE characters from the player's own revealed deck.
 * When both players have picked, teams are built in pick order and PLACEMENT begins.
 */
export function confirmSelection(
    gs: GameState,
    playerIndex: PlayerIndex,
    picks: readonly CatalogId[],
    build: (template: CharacterTemplate) => Character,
): GameState {
    assertPhase(gs, GamePhase.SELECTION);
    assertNotReady(gs, playerIndex);
    const selection = gs.selection;
    if (!selection) throw new Error('No selection in progress');
    assertValidPick(selection.decks[playerIndex], picks);

    const pickTuple: [readonly CatalogId[] | null, readonly CatalogId[] | null] = [selection.picks[0], selection.picks[1]];
    pickTuple[playerIndex] = [...picks];
    const updated = markPlayerReady({ ...gs, selection: { ...selection, picks: pickTuple } }, playerIndex);
    if (!areBothReady(updated)) return updated;

    const teamFor = (pi: PlayerIndex): Player => {
        const byId = new Map(selection.decks[pi].map(t => [t.id, t]));
        const chosen = pickTuple[pi] as readonly CatalogId[];
        return createPlayer(chosen.map(id => build(byId.get(id) as CharacterTemplate)), pi);
    };
    const { selection: _done, ...withoutSelection } = updated;
    return resetReady(beginPlacementPhase({ ...withoutSelection, players: [teamFor(0), teamFor(1)] }));
}

export function cancelSelection(gs: GameState, playerIndex: PlayerIndex): GameState {
    assertPhase(gs, GamePhase.SELECTION);
    if (!gs.playersReady[playerIndex] || !gs.selection) return gs;
    const picks: [readonly CatalogId[] | null, readonly CatalogId[] | null] = [gs.selection.picks[0], gs.selection.picks[1]];
    picks[playerIndex] = null;
    return unmarkPlayerReady({ ...gs, selection: { ...gs.selection, picks } }, playerIndex);
}

export function confirmPlacement(gs: GameState, playerIndex: PlayerIndex): Result<GameState, DomainError> {
    return checkPhase(gs, GamePhase.PLACEMENT)
        .andThen(g => checkNotReady(g, playerIndex))
        .map(g => {
            const updated = markPlayerReady(g, playerIndex);
            return areBothReady(updated) ? resetReady(beginRollPhase(updated)) : updated;
        });
}

export function performRoll(gs: GameState): GameState {
    assertPhase(gs, GamePhase.ROLL);
    return resetReady(beginKeepPhase(rerollBothPlayers(gs)));
}

export function confirmKeep(gs: GameState, playerIndex: PlayerIndex): GameState {
    assertPhase(gs, GamePhase.KEEP);
    assertNotReady(gs, playerIndex);
    const updated = markPlayerReady(gs, playerIndex);
    if (!areBothReady(updated)) return updated;

    const bothLocked = allDiceLocked(updated.players[0]) && allDiceLocked(updated.players[1]);
    if (updated.rollsLeft === 0 || bothLocked) {
        return resetReady(beginResolvePhase(updated));
    }

    const rerolled = { ...rerollBothPlayers(updated), rollsLeft: updated.rollsLeft - 1 };
    // After the final reroll there are no rerolls left, so locking is moot —
    // skip the dead keep round and go straight to resolve with the final dice.
    if (rerolled.rollsLeft === 0) {
        return resetReady(beginResolvePhase(rerolled));
    }
    return resetReady(rerolled);
}

export function cancelPlacement(gs: GameState, playerIndex: PlayerIndex): Result<GameState, DomainError> {
    return checkPhase(gs, GamePhase.PLACEMENT)
        .map(g => (g.playersReady[playerIndex] ? unmarkPlayerReady(g, playerIndex) : g));
}

export function cancelKeep(gs: GameState, playerIndex: PlayerIndex): GameState {
    assertPhase(gs, GamePhase.KEEP);
    if (!gs.playersReady[playerIndex]) return gs;
    return unmarkPlayerReady(gs, playerIndex);
}

export function performResolve(gs: GameState): { state: GameState; log: ResolveStep[] } {
    assertPhase(gs, GamePhase.RESOLVE);
    const withQueue = addAllEffectsToPriorityQueue(gs);
    const { state, log } = unstackPriorityQueueWithLog(withQueue);
    return { state: beginResultPhase(state), log };
}
