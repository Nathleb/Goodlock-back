import { TEST_CATALOG_ID } from './helpers/catalog';
import EffectLabel from "@domain/types/EffectLabels.type";
import GamePhase from "@domain/types/GamePhase.type";
import { SlotIndex } from "@domain/types/Position.type";
import GameState from "@domain/types/GameState.type";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import { gainShield } from "@domain/services/Character.service";
import { beginPlacementPhase } from "@domain/services/Phase.service";
import { endOfRound, checkWinner } from "@domain/services/Round.service";
import {
    confirmPlacement, performRoll, confirmKeep, performResolve,
} from "@domain/services/GameLoop.service";
import { enemyAbs, allyAbs, enemyRel, allyRel } from "./helpers/targets";
import { unwrap } from "./helpers/result";


// ─── Helpers ──────────────────────────────────────────────────────────────────

type DieFn = ReturnType<typeof generateFullDie>;

/** All 6 faces identical — random roll has no observable effect on which face fires. */
function uniformDie(
    description: string,
    priority: number,
    effects: BaseDieInstructions[0]['effects'],
): DieFn {
    const face = { description, priority, effects };
    return generateFullDie([face, face, face, face, face, face]);
}

/** Team of 5 characters sharing one die. */
function makeTeam(die: DieFn, playerIndex: 0 | 1, maxHp = 50) {
    return ([0, 1, 2, 3, 4] as SlotIndex[]).map(slot =>
        createCharacter({ catalogId: TEST_CATALOG_ID, name: `P${playerIndex}S${slot}`, maxHp, baseSpeed: 0, baseDie: die, position: { playerIndex, slot } }),
    );
}

/**
 * Advance PLACEMENT → ROLL → KEEP → RESOLVE.
 * Locks all dice after performRoll so confirmKeep takes the bothLocked path
 * and skips directly to RESOLVE without a re-roll.
 */
function advanceToResolve(gameState: GameState): GameState {
    let state = unwrap(confirmPlacement(gameState, 0));
    state = unwrap(confirmPlacement(state, 1));
    state = unwrap(performRoll(state));
    state = {
        ...state,
        players: state.players.map(player => ({
            ...player,
            team: player.team.map(char => ({ ...char, isFaceLocked: true })),
        })) as unknown as typeof state.players,
    };
    state = unwrap(confirmKeep(state, 0));
    state = unwrap(confirmKeep(state, 1));
    return state;
}

/** No-op die: every character fires, but this face has no effects. */
const noopDie = uniformDie('No-op', 1, []);

/**
 * Team of 5 where only the listed slots carry a real die; every other slot idles.
 * Everyone fires now (targets live in the face), so this reproduces the old
 * fixtures where only the characters given a target acted.
 */
function makeTeamWith(playerIndex: 0 | 1, dies: Partial<Record<SlotIndex, DieFn>>, maxHp = 50) {
    return ([0, 1, 2, 3, 4] as SlotIndex[]).map(slot =>
        createCharacter({ catalogId: TEST_CATALOG_ID, name: `P${playerIndex}S${slot}`, maxHp, baseSpeed: 0, baseDie: dies[slot] ?? noopDie, position: { playerIndex, slot } }),
    );
}

// ─── Phase flow ───────────────────────────────────────────────────────────────

describe('Domain integration — Phase flow', () => {
    it('PLACEMENT → ROLL → KEEP → RESOLVE → RESULT completes without error', () => {
        const dmgDie = uniformDie('Damage', 1, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyAbs(0)] }]);
        const gameState = createGameState(createPlayer(makeTeamWith(0, { 0: dmgDie }), 0), createPlayer(makeTeamWith(1, { 0: dmgDie }), 1));

        const resolvedState = advanceToResolve(gameState);
        expect(resolvedState.phase).toBe(GamePhase.RESOLVE);

        const { state } = unwrap(performResolve(resolvedState));
        expect(state.phase).toBe(GamePhase.RESULT);
    });

    it('confirmPlacement by one player stays in PLACEMENT with only that player ready', () => {
        const gameState = createGameState(createPlayer(makeTeam(noopDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const afterP0Confirms = unwrap(confirmPlacement(gameState, 0));
        expect(afterP0Confirms.phase).toBe(GamePhase.PLACEMENT);
        expect(afterP0Confirms.playersReady[0]).toBe(true);
        expect(afterP0Confirms.playersReady[1]).toBe(false);
    });

    it('priority queue is drained to empty after performResolve', () => {
        const gameState = createGameState(createPlayer(makeTeam(noopDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        expect(state.priorityQueue.length).toBe(0);
    });
});

// ─── Single-target damage ─────────────────────────────────────────────────────

describe('Domain integration — Single-target damage', () => {
    const dmgDie = uniformDie('Damage', 1, [{ effect: EffectLabel.Damage, magnitude: 10, targets: [enemyAbs(0)] }]);

    it('reduces target HP by exact damage amount', () => {
        const gameState = createGameState(createPlayer(makeTeamWith(0, { 0: dmgDie }), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        expect(state.players[1].team[0].hp).toBe(40);
    });

    it('both players deal damage to each other in the same round', () => {
        const gameState = createGameState(createPlayer(makeTeamWith(0, { 0: dmgDie }), 0), createPlayer(makeTeamWith(1, { 0: dmgDie }), 1));
        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        expect(state.players[0].team[0].hp).toBe(40);
        expect(state.players[1].team[0].hp).toBe(40);
    });

    it('overkill damage floors HP at 0', () => {
        const overkillDie = uniformDie('Overkill', 1, [{ effect: EffectLabel.Damage, magnitude: 999, targets: [enemyAbs(0)] }]);
        const gameState = createGameState(createPlayer(makeTeamWith(0, { 0: overkillDie }), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        expect(state.players[1].team[0].hp).toBe(0);
    });

    it('damage hits only the targeted slot — adjacent characters are unaffected', () => {
        const slot2Die = uniformDie('Damage', 1, [{ effect: EffectLabel.Damage, magnitude: 10, targets: [enemyAbs(2)] }]);
        const gameState = createGameState(createPlayer(makeTeamWith(0, { 0: slot2Die }), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        state.players[1].team.forEach((char, idx) =>
            expect(char.hp).toBe(idx === 2 ? 40 : 50),
        );
    });

});

// ─── Shield absorption ────────────────────────────────────────────────────────

describe('Domain integration — Shield absorption', () => {
    const dmgDie = uniformDie('Damage', 1, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyAbs(0)] }]);

    it('shield absorbs part of the damage before HP is reduced', () => {
        let gameState = createGameState(createPlayer(makeTeamWith(0, { 0: dmgDie }), 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [gameState.players[0], {
                ...gameState.players[1],
                team: gameState.players[1].team.map((char, idx) => idx === 0 ? gainShield(char, 3) : char),
            }] as typeof gameState.players,
        };

        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        expect(state.players[1].team[0].shield).toBe(0);
        expect(state.players[1].team[0].hp).toBe(48); // 50 - (5 - 3)
    });

    it('damage fully absorbed by shield leaves HP unchanged', () => {
        let gameState = createGameState(createPlayer(makeTeamWith(0, { 0: dmgDie }), 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [gameState.players[0], {
                ...gameState.players[1],
                team: gameState.players[1].team.map((char, idx) => idx === 0 ? gainShield(char, 10) : char),
            }] as typeof gameState.players,
        };

        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        expect(state.players[1].team[0].shield).toBe(5); // 10 - 5
        expect(state.players[1].team[0].hp).toBe(50);
    });
});

// ─── Heal effects ─────────────────────────────────────────────────────────────

describe('Domain integration — Heal effects', () => {
    it('single-target heal increases damaged target HP', () => {
        const healDie = uniformDie('Heal', 1, [{ effect: EffectLabel.Heal, magnitude: 15, targets: [allyAbs(1)] }]);
        let gameState = createGameState(createPlayer(makeTeamWith(0, { 0: healDie }), 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [{
                ...gameState.players[0],
                team: gameState.players[0].team.map((char, idx) => idx === 1 ? { ...char, hp: 30 } : char),
            }, gameState.players[1]] as typeof gameState.players,
        };

        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        expect(state.players[0].team[1].hp).toBe(45); // 30 + 15
    });

    it('heal is capped at maxHp and never overheals', () => {
        const bigHealDie = uniformDie('BigHeal', 1, [{ effect: EffectLabel.Heal, magnitude: 100, targets: [allyAbs(1)] }]);
        const gameState = createGameState(createPlayer(makeTeamWith(0, { 0: bigHealDie }), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        expect(state.players[0].team[1].hp).toBe(50);
    });

    it('dead character cannot be healed', () => {
        const healDie = uniformDie('Heal', 1, [{ effect: EffectLabel.Heal, magnitude: 20, targets: [allyAbs(1)] }]);
        let gameState = createGameState(createPlayer(makeTeamWith(0, { 0: healDie }), 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [{
                ...gameState.players[0],
                team: gameState.players[0].team.map((char, idx) => idx === 1 ? { ...char, hp: 0 } : char),
            }, gameState.players[1]] as typeof gameState.players,
        };

        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        expect(state.players[0].team[1].hp).toBe(0);
    });
});

// ─── Priority ordering ────────────────────────────────────────────────────────

describe('Domain integration — Priority ordering', () => {
    it('higher-priority attacker kills target before lower-priority defender fires', () => {
        const highPrioDmgDie = uniformDie('HighPrio', 5, [{ effect: EffectLabel.Damage, magnitude: 50, targets: [enemyAbs(0)] }]);
        const lowPrioDmgDie  = uniformDie('LowPrio',  1, [{ effect: EffectLabel.Damage, magnitude: 10, targets: [enemyAbs(0)] }]);
        const player0 = createPlayer([createCharacter({ catalogId: TEST_CATALOG_ID, name: 'Killer', maxHp: 50, baseSpeed: 0, baseDie: highPrioDmgDie, position: { playerIndex: 0, slot: 0 as SlotIndex } })], 0);
        const player1 = createPlayer([createCharacter({ catalogId: TEST_CATALOG_ID, name: 'Victim', maxHp: 50, baseSpeed: 0, baseDie: lowPrioDmgDie, position: { playerIndex: 1, slot: 0 as SlotIndex } })], 1);
        const gameState = createGameState(player0, player1);

        const resolvedState = advanceToResolve(gameState);
        const { state, log } = unwrap(performResolve(resolvedState));

        expect(state.players[1].team[0].hp).toBe(0);   // killed by high-prio
        expect(state.players[0].team[0].hp).toBe(50);  // never hit
        const victimStep = log.find(logStep => logStep.characterId === player1.team[0].id)!;
        expect(victimStep.skipped).toBe(true);
    });

    it('equal-priority characters both fire — neither is skipped', () => {
        const dmgDie = uniformDie('Damage', 3, [{ effect: EffectLabel.Damage, magnitude: 10, targets: [enemyAbs(0)] }]);
        const player0 = createPlayer([createCharacter({ catalogId: TEST_CATALOG_ID, name: 'A', maxHp: 50, baseSpeed: 0, baseDie: dmgDie, position: { playerIndex: 0, slot: 0 as SlotIndex } })], 0);
        const player1 = createPlayer([createCharacter({ catalogId: TEST_CATALOG_ID, name: 'B', maxHp: 50, baseSpeed: 0, baseDie: dmgDie, position: { playerIndex: 1, slot: 0 as SlotIndex } })], 1);
        const gameState = createGameState(player0, player1);

        const resolvedState = advanceToResolve(gameState);
        const { state, log } = unwrap(performResolve(resolvedState));

        expect(state.players[0].team[0].hp).toBe(40);
        expect(state.players[1].team[0].hp).toBe(40);
        expect(log.every(step => !step.skipped)).toBe(true);
    });

    it('resolve log contains a step for every queued character', () => {
        const dmgDie = uniformDie('Damage', 1, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyAbs(0)] }]);
        const player0 = createPlayer([createCharacter({ catalogId: TEST_CATALOG_ID, name: 'A', maxHp: 50, baseSpeed: 0, baseDie: dmgDie, position: { playerIndex: 0, slot: 0 as SlotIndex } })], 0);
        const player1 = createPlayer([createCharacter({ catalogId: TEST_CATALOG_ID, name: 'B', maxHp: 50, baseSpeed: 0, baseDie: dmgDie, position: { playerIndex: 1, slot: 0 as SlotIndex } })], 1);
        const gameState = createGameState(player0, player1);

        const resolvedState = advanceToResolve(gameState);
        const { log } = unwrap(performResolve(resolvedState));

        expect(log).toHaveLength(2);
        expect(log.every(step => !step.skipped)).toBe(true);
        expect(log.every(step => step.changes.length === 1)).toBe(true);
    });
});

// ─── Self-targeted effects ──────────────────────────────────────────

describe('Domain integration — Self-targeted effects', () => {
    it('a self-heal fires in resolve with no target assignment', () => {
        const selfHealDie = uniformDie('Self-heal', 1, [{ effect: EffectLabel.Heal, magnitude: 20, targets: [allyRel(0)] }]);
        let gameState = createGameState(createPlayer(makeTeam(selfHealDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [{
                ...gameState.players[0],
                team: gameState.players[0].team.map((char, idx) => idx === 0 ? { ...char, hp: 30 } : char),
            }, gameState.players[1]] as typeof gameState.players,
        };

        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));

        expect(state.players[0].team[0].hp).toBe(50); // 30 + 20
    });

    it('a self-shield grants shield to each character with no target assignment', () => {
        const selfShieldDie = uniformDie('Self-shield', 1, [{ effect: EffectLabel.Shield, magnitude: 5, targets: [allyRel(0)] }]);
        const gameState = createGameState(createPlayer(makeTeam(selfShieldDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));

        state.players[0].team.forEach(char => expect(char.shield).toBe(5));
    });

    it('self-targeted and enemy-targeted faces coexist and both fire correctly in the same round', () => {
        const selfHealDie = uniformDie('Self-heal', 1, [{ effect: EffectLabel.Heal, magnitude: 20, targets: [allyRel(0)] }]);
        const dmgDie      = uniformDie('Damage',   1, [{ effect: EffectLabel.Damage, magnitude: 10, targets: [enemyAbs(0)] }]);

        const player0Team = [
            createCharacter({ catalogId: TEST_CATALOG_ID, name: 'Self-healer', maxHp: 50, baseSpeed: 0, baseDie: selfHealDie, position: { playerIndex: 0, slot: 0 as SlotIndex } }),
            createCharacter({ catalogId: TEST_CATALOG_ID, name: 'Attacker', maxHp: 50, baseSpeed: 0, baseDie: dmgDie, position: { playerIndex: 0, slot: 1 as SlotIndex } }),
            ...[2, 3, 4].map(idx => createCharacter({ catalogId: TEST_CATALOG_ID, name: `P0S${idx}`, maxHp: 50, baseSpeed: 0, baseDie: noopDie, position: { playerIndex: 0, slot: idx as SlotIndex } })),
        ];
        let gameState = createGameState(createPlayer(player0Team, 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [{
                ...gameState.players[0],
                team: gameState.players[0].team.map((char, idx) => idx === 0 ? { ...char, hp: 20 } : char),
            }, gameState.players[1]] as typeof gameState.players,
        };

        const resolvedState = advanceToResolve(gameState);
        // Self-healer (slot 0) heals itself; Attacker (slot 1) hits the enemy at slot 0
        const { state } = unwrap(performResolve(resolvedState));

        expect(state.players[0].team[0].hp).toBe(40); // self-heal: 20 + 20
        expect(state.players[1].team[0].hp).toBe(40); // Took 10 damage
    });
});

// ─── cleave effects ───────────────────────────────────────────────────────────

describe('Domain integration — cleave effects', () => {
    it('cleave damage around slot 2 hits slots 1, 2 and 3 only', () => {
        const cleaveDmgDie = uniformDie('cleave', 1, [{ effect: EffectLabel.Damage, magnitude: 8, targets: [enemyAbs(1, 2, 3)] }]);
        const gameState = createGameState(createPlayer(makeTeamWith(0, { 0: cleaveDmgDie }), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        state.players[1].team.forEach((char, idx) =>
            expect(char.hp).toBe([1, 2, 3].includes(idx) ? 42 : 50),
        );
    });

    it('cleave damage at edge slot 0 hits only slots 0 and 1', () => {
        const cleaveDmgDie = uniformDie('cleave', 1, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyAbs(0, 1)] }]);
        const gameState = createGameState(createPlayer(makeTeamWith(0, { 0: cleaveDmgDie }), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        state.players[1].team.forEach((char, idx) =>
            expect(char.hp).toBe(idx <= 1 ? 45 : 50),
        );
    });

    it('cleave heal around slot 2 heals allies at slots 1, 2 and 3', () => {
        const cleaveHealDie = uniformDie('cleave heal', 1, [{ effect: EffectLabel.Heal, magnitude: 10, targets: [allyAbs(1, 2, 3)] }]);
        let gameState = createGameState(createPlayer(makeTeamWith(0, { 0: cleaveHealDie }), 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [{
                ...gameState.players[0],
                team: gameState.players[0].team.map(char => ({ ...char, hp: 30 })),
            }, gameState.players[1]] as typeof gameState.players,
        };

        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        state.players[0].team.forEach((char, idx) =>
            expect(char.hp).toBe([1, 2, 3].includes(idx) ? 40 : 30),
        );
    });
});

// ─── Full-team effects ─────────────────────────────────────────────────────────

describe('Domain integration — Full-team effects', () => {
    it('full-team damage deals damage to all 5 enemy characters', () => {
        const fullTeamDmgDie = uniformDie('Full-team damage', 1, [{ effect: EffectLabel.Damage, magnitude: 6, targets: [enemyAbs(0, 1, 2, 3, 4)] }]);
        const gameState = createGameState(createPlayer(makeTeamWith(0, { 0: fullTeamDmgDie }), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        state.players[1].team.forEach(char => expect(char.hp).toBe(44));
    });

    it('full-team heal restores HP to all 5 ally characters including actor', () => {
        const fullTeamHealDie = uniformDie('Full-team heal', 1, [{ effect: EffectLabel.Heal, magnitude: 12, targets: [allyAbs(0, 1, 2, 3, 4)] }]);
        let gameState = createGameState(createPlayer(makeTeamWith(0, { 0: fullTeamHealDie }), 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [{
                ...gameState.players[0],
                team: gameState.players[0].team.map(char => ({ ...char, hp: 30 })),
            }, gameState.players[1]] as typeof gameState.players,
        };

        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        state.players[0].team.forEach(char => expect(char.hp).toBe(42)); // 30 + 12
    });

    it('full-team shield grants shield to all 5 ally characters', () => {
        const fullTeamShieldDie = uniformDie('Full-team shield', 1, [{ effect: EffectLabel.Shield, magnitude: 4, targets: [allyAbs(0, 1, 2, 3, 4)] }]);
        const gameState = createGameState(createPlayer(makeTeamWith(0, { 0: fullTeamShieldDie }), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        state.players[0].team.forEach(char => expect(char.shield).toBe(4));
    });
});

// ─── Win conditions ───────────────────────────────────────────────────────────

describe('Domain integration — Win conditions', () => {
    const killDie = uniformDie('Kill', 1, [{ effect: EffectLabel.Damage, magnitude: 50, targets: [enemyRel(0)] }]);

    it('checkWinner returns 0 when player 1 loses 3 or more characters', () => {
        const gameState = createGameState(createPlayer(makeTeam(killDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        expect(checkWinner(state)).toBe(0);
    });

    it('checkWinner returns 1 when player 0 loses 3 or more characters', () => {
        const gameState = createGameState(createPlayer(makeTeam(noopDie, 0), 0), createPlayer(makeTeam(killDie, 1), 1));
        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        expect(checkWinner(state)).toBe(1);
    });

    it('checkWinner returns draw when both teams have 3+ dead characters', () => {
        // Test checkWinner directly with a known-dead state: it isolates the
        // winner rule from the resolution order.
        const gameState = createGameState(createPlayer(makeTeam(noopDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const killThree = (team: typeof gameState.players[0]['team']) =>
            team.map((char, idx) => idx < 3 ? { ...char, hp: 0 } : char);
        const stateWithDeadChars: GameState = {
            ...gameState,
            players: [
                { ...gameState.players[0], team: killThree(gameState.players[0].team) },
                { ...gameState.players[1], team: killThree(gameState.players[1].team) },
            ] as typeof gameState.players,
        };
        expect(checkWinner(stateWithDeadChars)).toBe('draw');
    });

    it('checkWinner returns null when fewer than 3 characters have died', () => {
        const dmgDie = uniformDie('Damage', 1, [{ effect: EffectLabel.Damage, magnitude: 10, targets: [enemyAbs(0)] }]);
        const gameState = createGameState(createPlayer(makeTeamWith(0, { 0: dmgDie }), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const resolvedState = advanceToResolve(gameState);
        const { state } = unwrap(performResolve(resolvedState));
        expect(checkWinner(state)).toBeNull();
    });
});

// ─── Round cleanup and multi-round ────────────────────────────────────────────

describe('Domain integration — Round cleanup and multi-round', () => {
    it('endOfRound resets shields, unlocks dice, increments round, restores rollsLeft', () => {
        const dmgDie = uniformDie('Damage', 1, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyAbs(0)] }]);
        let gameState = createGameState(createPlayer(makeTeamWith(0, { 0: dmgDie }), 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [gameState.players[0], {
                ...gameState.players[1],
                team: gameState.players[1].team.map((char, idx) => idx === 0 ? gainShield(char, 8) : char),
            }] as typeof gameState.players,
        };

        const postKeepState = advanceToResolve(gameState);
        const { state: resolvedState } = unwrap(performResolve(postKeepState));

        const nextRoundState = endOfRound(resolvedState);
        expect(nextRoundState.currentRound).toBe(1);
        expect(nextRoundState.rollsLeft).toBe(2);
        nextRoundState.players.forEach(player => player.team.forEach(char => {
            expect(char.shield).toBe(0);
            expect(char.isFaceLocked).toBe(false);
        }));
    });

    it('shield granted in round 1 does not absorb damage in round 2 after endOfRound', () => {
        const selfShieldDie = uniformDie('Self-shield', 2, [{ effect: EffectLabel.Shield, magnitude: 10, targets: [allyRel(0)] }]);
        const dmgDie        = uniformDie('Damage',     1, [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyAbs(0)] }]);

        const player0Team = [
            createCharacter({ catalogId: TEST_CATALOG_ID, name: 'Attacker', maxHp: 50, baseSpeed: 0, baseDie: dmgDie, position: { playerIndex: 0, slot: 0 as SlotIndex } }),
            ...[1, 2, 3, 4].map(idx => createCharacter({ catalogId: TEST_CATALOG_ID, name: `P0S${idx}`, maxHp: 50, baseSpeed: 0, baseDie: noopDie, position: { playerIndex: 0, slot: idx as SlotIndex } })),
        ];
        const player1Team = [
            createCharacter({ catalogId: TEST_CATALOG_ID, name: 'Shielder', maxHp: 50, baseSpeed: 0, baseDie: selfShieldDie, position: { playerIndex: 1, slot: 0 as SlotIndex } }),
            ...[1, 2, 3, 4].map(idx => createCharacter({ catalogId: TEST_CATALOG_ID, name: `P1S${idx}`, maxHp: 50, baseSpeed: 0, baseDie: noopDie, position: { playerIndex: 1, slot: idx as SlotIndex } })),
        ];
        const gameState = createGameState(createPlayer(player0Team, 0), createPlayer(player1Team, 1));

        // Round 1: P1 slot 0 self-shields (priority 2 fires first), P0 slot 0 deals 5 damage
        let resolvedState = advanceToResolve(gameState);
        const { state: round1State } = unwrap(performResolve(resolvedState));
        // Shield (10) absorbed 5 damage → HP=50, shield=5 remaining
        expect(round1State.players[1].team[0].hp).toBe(50);
        expect(round1State.players[1].team[0].shield).toBe(5);

        // endOfRound: shield resets, next round begins
        const round2GameState = beginPlacementPhase(endOfRound(round1State));
        expect(round2GameState.players[1].team[0].shield).toBe(0);

        // Round 2: same setup. P1 slot 0 self-shields again (priority 2 fires first → shield=10),
        // then P0 deals 5 damage (priority 1) → shield absorbs again
        resolvedState = advanceToResolve(round2GameState);
        const { state: round2State } = unwrap(performResolve(resolvedState));
        expect(round2State.players[1].team[0].hp).toBe(50);  // shield absorbed again

        // If we strip the self-shield by using a non-shielding P1, HP takes full damage
        const round3GameState = beginPlacementPhase(endOfRound(round2State));
        const player1NoShield = createPlayer(
            [createCharacter({ catalogId: TEST_CATALOG_ID, name: 'Target', maxHp: round3GameState.players[1].team[0].hp, baseSpeed: 0, baseDie: noopDie, position: { playerIndex: 1, slot: 0 as SlotIndex } }),
             ...[1,2,3,4].map(idx => createCharacter({ catalogId: TEST_CATALOG_ID, name: `P1S${idx}`, maxHp: 50, baseSpeed: 0, baseDie: noopDie, position: { playerIndex: 1, slot: idx as SlotIndex } }))],
            1,
        );
        const round3GameStateNoShield = { ...round3GameState, players: [round3GameState.players[0], player1NoShield] as typeof round3GameState.players };
        resolvedState = advanceToResolve(round3GameStateNoShield);
        const { state: round3State } = unwrap(performResolve(resolvedState));
        expect(round3State.players[1].team[0].hp).toBe(round3GameState.players[1].team[0].hp - 5); // no shield → full damage
    });

    it('damage accumulates correctly across two consecutive rounds', () => {
        const dmgDie = uniformDie('Damage', 1, [{ effect: EffectLabel.Damage, magnitude: 10, targets: [enemyAbs(0)] }]);
        const initialGameState = createGameState(createPlayer(makeTeamWith(0, { 0: dmgDie }), 0), createPlayer(makeTeam(noopDie, 1), 1));

        // Round 1
        const { state: round1State } = unwrap(performResolve(advanceToResolve(initialGameState)));
        expect(round1State.players[1].team[0].hp).toBe(40);

        // Round 2
        const round2GameState = beginPlacementPhase(endOfRound(round1State));
        const { state: round2State } = unwrap(performResolve(advanceToResolve(round2GameState)));
        expect(round2State.players[1].team[0].hp).toBe(30);
        // endOfRound hasn't been called yet; counter was incremented once (after round 1)
        expect(round2State.currentRound).toBe(1);
    });
});
