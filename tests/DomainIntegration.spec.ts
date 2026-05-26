import EffectLabel from "@domain/types/EffectLabels.type";
import TargetConstraint from "@domain/types/TargetConstraint.type";
import GamePhase from "@domain/types/GamePhase.type";
import Position, { SlotIndex } from "@domain/types/Position.type";
import GameState from "@domain/types/GameState.type";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { ResolveStep } from "@domain/types/PriorityQueue.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState, initializeEffects } from "@domain/services/GameInit.service";
import { createPlayer, selectTargetOfCharacter } from "@domain/services/Player.service";
import { gainShield } from "@domain/services/Character.service";
import { beginPlacementPhase } from "@domain/services/Phase.service";
import { endOfRound, checkWinner } from "@domain/services/Round.service";
import {
    confirmPlacement, performRoll, confirmKeep, confirmAssignment, performResolve,
} from "@domain/services/GameLoop.service";

initializeEffects();

// ─── Helpers ──────────────────────────────────────────────────────────────────

type DieFn = ReturnType<typeof generateFullDie>;

/** All 6 faces identical — random roll has no observable effect on which face fires. */
function uniformDie(
    description: string,
    priority: number,
    effects: BaseDieInstructions[0]['effects'],
    targetConstraint: TargetConstraint,
): DieFn {
    const face = { description, priority, effects, targetConstraint };
    return generateFullDie([face, face, face, face, face, face]);
}

/** Team of 5 characters sharing one die. */
function makeTeam(die: DieFn, playerIndex: 0 | 1, maxHp = 50) {
    return ([0, 1, 2, 3, 4] as SlotIndex[]).map(slot =>
        createCharacter(`P${playerIndex}S${slot}`, maxHp, 0, die, { playerIndex, slot }),
    );
}

/**
 * Advance PLACEMENT → ROLL → KEEP → ASSIGN.
 * Locks all dice after performRoll so confirmKeep takes the bothLocked path
 * and skips directly to ASSIGN without a re-roll.
 */
function advanceToAssign(gameState: GameState): GameState {
    let state = confirmPlacement(gameState, 0);
    state = confirmPlacement(state, 1);
    state = performRoll(state);
    state = {
        ...state,
        players: state.players.map(player => ({
            ...player,
            team: player.team.map(char => ({ ...char, isFaceLocked: true })),
        })) as typeof state.players,
    };
    state = confirmKeep(state, 0);
    state = confirmKeep(state, 1);
    return state;
}

/** Assign targets to specific character slots of one player, chaining correctly. */
function setTargets(
    gameState: GameState,
    playerIndex: 0 | 1,
    assignments: { slot: SlotIndex; target: Position }[],
): GameState {
    let player = gameState.players[playerIndex];
    for (const { slot, target } of assignments) {
        player = selectTargetOfCharacter(player, slot, target);
    }
    const players = [...gameState.players] as typeof gameState.players;
    players[playerIndex] = player;
    return { ...gameState, players };
}

/** Assign all targets, confirm both players, and resolve. */
function resolveRound(
    gameState: GameState,
    p0Targets: { slot: SlotIndex; target: Position }[],
    p1Targets: { slot: SlotIndex; target: Position }[],
): { state: GameState; log: ResolveStep[] } {
    let state = setTargets(gameState, 0, p0Targets);
    state = setTargets(state, 1, p1Targets);
    state = confirmAssignment(state, 0);
    state = confirmAssignment(state, 1);
    return performResolve(state);
}

/** No-op die: fires automatically (NONE constraint) but has no effects. */
const noopDie = uniformDie('No-op', 1, [], TargetConstraint.NONE);

// ─── Phase flow ───────────────────────────────────────────────────────────────

describe('Domain integration — Phase flow', () => {
    it('PLACEMENT → ROLL → KEEP → ASSIGN → RESOLVE → RESULT completes without error', () => {
        const dmgDie = uniformDie('Damage', 1, [{ effect: EffectLabel.SingleTargetDamage, magnitude: 5 }], TargetConstraint.ENEMY_ONLY);
        const gameState = createGameState(createPlayer(makeTeam(dmgDie, 0), 0), createPlayer(makeTeam(dmgDie, 1), 1));

        const assignPhaseState = advanceToAssign(gameState);
        expect(assignPhaseState.phase).toBe(GamePhase.ASSIGN);

        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [{ slot: 0 as SlotIndex, target: { playerIndex: 0, slot: 0 as SlotIndex } }],
        );
        expect(state.phase).toBe(GamePhase.RESULT);
    });

    it('confirmPlacement by one player stays in PLACEMENT with only that player ready', () => {
        const gameState = createGameState(createPlayer(makeTeam(noopDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const afterP0Confirms = confirmPlacement(gameState, 0);
        expect(afterP0Confirms.phase).toBe(GamePhase.PLACEMENT);
        expect(afterP0Confirms.playersReady[0]).toBe(true);
        expect(afterP0Confirms.playersReady[1]).toBe(false);
    });

    it('priority queue is drained to empty after performResolve', () => {
        const gameState = createGameState(createPlayer(makeTeam(noopDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState, [], []);
        expect(state.priorityQueue.every(bucket => bucket.length === 0)).toBe(true);
    });
});

// ─── Single-target damage ─────────────────────────────────────────────────────

describe('Domain integration — Single-target damage', () => {
    const dmgDie = uniformDie('Damage', 1, [{ effect: EffectLabel.SingleTargetDamage, magnitude: 10 }], TargetConstraint.ENEMY_ONLY);

    it('reduces target HP by exact damage amount', () => {
        const gameState = createGameState(createPlayer(makeTeam(dmgDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [],
        );
        expect(state.players[1].team[0].hp).toBe(40);
    });

    it('both players deal damage to each other in the same round', () => {
        const gameState = createGameState(createPlayer(makeTeam(dmgDie, 0), 0), createPlayer(makeTeam(dmgDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [{ slot: 0 as SlotIndex, target: { playerIndex: 0, slot: 0 as SlotIndex } }],
        );
        expect(state.players[0].team[0].hp).toBe(40);
        expect(state.players[1].team[0].hp).toBe(40);
    });

    it('overkill damage floors HP at 0', () => {
        const overkillDie = uniformDie('Overkill', 1, [{ effect: EffectLabel.SingleTargetDamage, magnitude: 999 }], TargetConstraint.ENEMY_ONLY);
        const gameState = createGameState(createPlayer(makeTeam(overkillDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [],
        );
        expect(state.players[1].team[0].hp).toBe(0);
    });

    it('damage hits only the targeted slot — adjacent characters are unaffected', () => {
        const gameState = createGameState(createPlayer(makeTeam(dmgDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 2 as SlotIndex } }],
            [],
        );
        state.players[1].team.forEach((char, idx) =>
            expect(char.hp).toBe(idx === 2 ? 40 : 50),
        );
    });

    it('characters without an assigned target do not fire', () => {
        const gameState = createGameState(createPlayer(makeTeam(dmgDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);
        // Only slot 0 gets a target; slots 1-4 silently skip
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [],
        );
        // Only P1 slot 0 was hit
        expect(state.players[1].team[0].hp).toBe(40);
        state.players[1].team.slice(1).forEach(char => expect(char.hp).toBe(50));
    });
});

// ─── Shield absorption ────────────────────────────────────────────────────────

describe('Domain integration — Shield absorption', () => {
    const dmgDie = uniformDie('Damage', 1, [{ effect: EffectLabel.SingleTargetDamage, magnitude: 5 }], TargetConstraint.ENEMY_ONLY);

    it('shield absorbs part of the damage before HP is reduced', () => {
        let gameState = createGameState(createPlayer(makeTeam(dmgDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [gameState.players[0], {
                ...gameState.players[1],
                team: gameState.players[1].team.map((char, idx) => idx === 0 ? gainShield(char, 3) : char),
            }] as typeof gameState.players,
        };

        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [],
        );
        expect(state.players[1].team[0].shield).toBe(0);
        expect(state.players[1].team[0].hp).toBe(48); // 50 - (5 - 3)
    });

    it('damage fully absorbed by shield leaves HP unchanged', () => {
        let gameState = createGameState(createPlayer(makeTeam(dmgDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [gameState.players[0], {
                ...gameState.players[1],
                team: gameState.players[1].team.map((char, idx) => idx === 0 ? gainShield(char, 10) : char),
            }] as typeof gameState.players,
        };

        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [],
        );
        expect(state.players[1].team[0].shield).toBe(5); // 10 - 5
        expect(state.players[1].team[0].hp).toBe(50);
    });
});

// ─── Heal effects ─────────────────────────────────────────────────────────────

describe('Domain integration — Heal effects', () => {
    it('single-target heal increases damaged target HP', () => {
        const healDie = uniformDie('Heal', 1, [{ effect: EffectLabel.SingleTargetHeal, magnitude: 15 }], TargetConstraint.ALLY_ONLY);
        let gameState = createGameState(createPlayer(makeTeam(healDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [{
                ...gameState.players[0],
                team: gameState.players[0].team.map((char, idx) => idx === 1 ? { ...char, hp: 30 } : char),
            }, gameState.players[1]] as typeof gameState.players,
        };

        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 0, slot: 1 as SlotIndex } }],
            [],
        );
        expect(state.players[0].team[1].hp).toBe(45); // 30 + 15
    });

    it('heal is capped at maxHp and never overheals', () => {
        const bigHealDie = uniformDie('BigHeal', 1, [{ effect: EffectLabel.SingleTargetHeal, magnitude: 100 }], TargetConstraint.ALLY_ONLY);
        const gameState = createGameState(createPlayer(makeTeam(bigHealDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 0, slot: 1 as SlotIndex } }],
            [],
        );
        expect(state.players[0].team[1].hp).toBe(50);
    });

    it('dead character cannot be healed', () => {
        const healDie = uniformDie('Heal', 1, [{ effect: EffectLabel.SingleTargetHeal, magnitude: 20 }], TargetConstraint.ALLY_ONLY);
        let gameState = createGameState(createPlayer(makeTeam(healDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [{
                ...gameState.players[0],
                team: gameState.players[0].team.map((char, idx) => idx === 1 ? { ...char, hp: 0 } : char),
            }, gameState.players[1]] as typeof gameState.players,
        };

        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 0, slot: 1 as SlotIndex } }],
            [],
        );
        expect(state.players[0].team[1].hp).toBe(0);
    });
});

// ─── Priority ordering ────────────────────────────────────────────────────────

describe('Domain integration — Priority ordering', () => {
    it('higher-priority attacker kills target before lower-priority defender fires', () => {
        const highPrioDmgDie = uniformDie('HighPrio', 5, [{ effect: EffectLabel.SingleTargetDamage, magnitude: 50 }], TargetConstraint.ENEMY_ONLY);
        const lowPrioDmgDie  = uniformDie('LowPrio',  1, [{ effect: EffectLabel.SingleTargetDamage, magnitude: 10 }], TargetConstraint.ENEMY_ONLY);
        const player0 = createPlayer([createCharacter('Killer', 50, 0, highPrioDmgDie, { playerIndex: 0, slot: 0 as SlotIndex })], 0);
        const player1 = createPlayer([createCharacter('Victim', 50, 0, lowPrioDmgDie,  { playerIndex: 1, slot: 0 as SlotIndex })], 1);
        const gameState = createGameState(player0, player1);

        const assignPhaseState = advanceToAssign(gameState);
        const { state, log } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [{ slot: 0 as SlotIndex, target: { playerIndex: 0, slot: 0 as SlotIndex } }],
        );

        expect(state.players[1].team[0].hp).toBe(0);   // killed by high-prio
        expect(state.players[0].team[0].hp).toBe(50);  // never hit
        const victimStep = log.find(logStep => logStep.characterId === player1.team[0].id)!;
        expect(victimStep.skipped).toBe(true);
    });

    it('equal-priority characters both fire — neither is skipped', () => {
        const dmgDie = uniformDie('Damage', 3, [{ effect: EffectLabel.SingleTargetDamage, magnitude: 10 }], TargetConstraint.ENEMY_ONLY);
        const player0 = createPlayer([createCharacter('A', 50, 0, dmgDie, { playerIndex: 0, slot: 0 as SlotIndex })], 0);
        const player1 = createPlayer([createCharacter('B', 50, 0, dmgDie, { playerIndex: 1, slot: 0 as SlotIndex })], 1);
        const gameState = createGameState(player0, player1);

        const assignPhaseState = advanceToAssign(gameState);
        const { state, log } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [{ slot: 0 as SlotIndex, target: { playerIndex: 0, slot: 0 as SlotIndex } }],
        );

        expect(state.players[0].team[0].hp).toBe(40);
        expect(state.players[1].team[0].hp).toBe(40);
        expect(log.every(step => !step.skipped)).toBe(true);
    });

    it('resolve log contains a step for every queued character', () => {
        const dmgDie = uniformDie('Damage', 1, [{ effect: EffectLabel.SingleTargetDamage, magnitude: 5 }], TargetConstraint.ENEMY_ONLY);
        const player0 = createPlayer([createCharacter('A', 50, 0, dmgDie, { playerIndex: 0, slot: 0 as SlotIndex })], 0);
        const player1 = createPlayer([createCharacter('B', 50, 0, dmgDie, { playerIndex: 1, slot: 0 as SlotIndex })], 1);
        const gameState = createGameState(player0, player1);

        const assignPhaseState = advanceToAssign(gameState);
        const { log } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [{ slot: 0 as SlotIndex, target: { playerIndex: 0, slot: 0 as SlotIndex } }],
        );

        expect(log).toHaveLength(2);
        expect(log.every(step => !step.skipped)).toBe(true);
        expect(log.every(step => step.changes.length === 1)).toBe(true);
    });
});

// ─── NONE-constraint (self-effects) ──────────────────────────────────────────

describe('Domain integration — NONE-constraint self-effects', () => {
    it('SelfHeal fires in resolve without any assigned target', () => {
        const selfHealDie = uniformDie('SelfHeal', 1, [{ effect: EffectLabel.SelfHeal, magnitude: 20 }], TargetConstraint.NONE);
        let gameState = createGameState(createPlayer(makeTeam(selfHealDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [{
                ...gameState.players[0],
                team: gameState.players[0].team.map((char, idx) => idx === 0 ? { ...char, hp: 30 } : char),
            }, gameState.players[1]] as typeof gameState.players,
        };

        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState, [], []); // no target assignments at all

        expect(state.players[0].team[0].hp).toBe(50); // 30 + 20
    });

    it('SelfShield grants shield to each character without any assigned target', () => {
        const selfShieldDie = uniformDie('SelfShield', 1, [{ effect: EffectLabel.SelfShield, magnitude: 5 }], TargetConstraint.NONE);
        const gameState = createGameState(createPlayer(makeTeam(selfShieldDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState, [], []);

        state.players[0].team.forEach(char => expect(char.shield).toBe(5));
    });

    it('NONE and ENEMY_ONLY faces coexist and both fire correctly in the same round', () => {
        const selfHealDie = uniformDie('SelfHeal', 1, [{ effect: EffectLabel.SelfHeal, magnitude: 20 }], TargetConstraint.NONE);
        const dmgDie      = uniformDie('Damage',   1, [{ effect: EffectLabel.SingleTargetDamage, magnitude: 10 }], TargetConstraint.ENEMY_ONLY);

        const player0Team = [
            createCharacter('SelfHealer', 50, 0, selfHealDie, { playerIndex: 0, slot: 0 as SlotIndex }),
            createCharacter('Attacker',   50, 0, dmgDie,      { playerIndex: 0, slot: 1 as SlotIndex }),
            ...[2, 3, 4].map(idx => createCharacter(`P0S${idx}`, 50, 0, noopDie, { playerIndex: 0, slot: idx as SlotIndex })),
        ];
        let gameState = createGameState(createPlayer(player0Team, 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [{
                ...gameState.players[0],
                team: gameState.players[0].team.map((char, idx) => idx === 0 ? { ...char, hp: 20 } : char),
            }, gameState.players[1]] as typeof gameState.players,
        };

        const assignPhaseState = advanceToAssign(gameState);
        // SelfHealer (slot 0) needs no target; Attacker (slot 1) needs an enemy target
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 1 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [],
        );

        expect(state.players[0].team[0].hp).toBe(40); // SelfHeal: 20 + 20
        expect(state.players[1].team[0].hp).toBe(40); // Took 10 damage
    });
});

// ─── Target constraint enforcement ───────────────────────────────────────────

describe('Domain integration — Target constraint enforcement', () => {
    it('ENEMY_ONLY face throws when player targets their own team', () => {
        const dmgDie = uniformDie('Damage', 1, [{ effect: EffectLabel.SingleTargetDamage, magnitude: 5 }], TargetConstraint.ENEMY_ONLY);
        const gameState = createGameState(createPlayer(makeTeam(dmgDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);

        expect(() =>
            selectTargetOfCharacter(assignPhaseState.players[0], 0 as SlotIndex, { playerIndex: 0, slot: 1 as SlotIndex }),
        ).toThrow('ENEMY_ONLY');
    });

    it('ALLY_ONLY face throws when player targets the enemy team', () => {
        const healDie = uniformDie('Heal', 1, [{ effect: EffectLabel.SingleTargetHeal, magnitude: 5 }], TargetConstraint.ALLY_ONLY);
        const gameState = createGameState(createPlayer(makeTeam(healDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);

        expect(() =>
            selectTargetOfCharacter(assignPhaseState.players[0], 0 as SlotIndex, { playerIndex: 1, slot: 0 as SlotIndex }),
        ).toThrow('ALLY_ONLY');
    });

    it('ALLY_ONLY face accepts a target on the actor\'s own team', () => {
        const healDie = uniformDie('Heal', 1, [{ effect: EffectLabel.SingleTargetHeal, magnitude: 5 }], TargetConstraint.ALLY_ONLY);
        const gameState = createGameState(createPlayer(makeTeam(healDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);

        expect(() =>
            selectTargetOfCharacter(assignPhaseState.players[0], 0 as SlotIndex, { playerIndex: 0, slot: 1 as SlotIndex }),
        ).not.toThrow();
    });

    it('violated constraint at resolve time throws rather than silently miscalculating', () => {
        // Manually inject a bad queue entry (ALLY_ONLY face targeting the enemy) to verify
        // the resolution guard catches it as a hard error.
        const allyOnlyDie = uniformDie('Heal', 1, [{ effect: EffectLabel.SingleTargetHeal, magnitude: 5 }], TargetConstraint.ALLY_ONLY);
        const gameState = createGameState(createPlayer(makeTeam(allyOnlyDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        let assignPhaseState = advanceToAssign(gameState);

        // Directly manipulate a target to be invalid (bypass selectTargetOfCharacter validation)
        assignPhaseState = {
            ...assignPhaseState,
            players: [{
                ...assignPhaseState.players[0],
                team: assignPhaseState.players[0].team.map((char, idx) =>
                    idx === 0 ? { ...char, target: { playerIndex: 1 as const, slot: 0 as SlotIndex } } : char,
                ),
            }, assignPhaseState.players[1]] as typeof assignPhaseState.players,
        };
        assignPhaseState = confirmAssignment(assignPhaseState, 0);
        assignPhaseState = confirmAssignment(assignPhaseState, 1);

        expect(() => performResolve(assignPhaseState)).toThrow('ALLY_ONLY');
    });
});

// ─── Cleave effects ───────────────────────────────────────────────────────────

describe('Domain integration — Cleave effects', () => {
    it('CleaveDamage targeting slot 2 hits slots 1, 2 and 3 only', () => {
        const cleaveDmgDie = uniformDie('Cleave', 1, [{ effect: EffectLabel.CleaveDamage, magnitude: 8 }], TargetConstraint.ENEMY_ONLY);
        const gameState = createGameState(createPlayer(makeTeam(cleaveDmgDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 2 as SlotIndex } }],
            [],
        );
        state.players[1].team.forEach((char, idx) =>
            expect(char.hp).toBe([1, 2, 3].includes(idx) ? 42 : 50),
        );
    });

    it('CleaveDamage at edge slot 0 hits only slots 0 and 1', () => {
        const cleaveDmgDie = uniformDie('Cleave', 1, [{ effect: EffectLabel.CleaveDamage, magnitude: 5 }], TargetConstraint.ENEMY_ONLY);
        const gameState = createGameState(createPlayer(makeTeam(cleaveDmgDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [],
        );
        state.players[1].team.forEach((char, idx) =>
            expect(char.hp).toBe(idx <= 1 ? 45 : 50),
        );
    });

    it('CleaveHeal targeting slot 2 heals allies at slots 1, 2 and 3', () => {
        const cleaveHealDie = uniformDie('CleaveHeal', 1, [{ effect: EffectLabel.CleaveHeal, magnitude: 10 }], TargetConstraint.ALLY_ONLY);
        let gameState = createGameState(createPlayer(makeTeam(cleaveHealDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [{
                ...gameState.players[0],
                team: gameState.players[0].team.map(char => ({ ...char, hp: 30 })),
            }, gameState.players[1]] as typeof gameState.players,
        };

        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 0, slot: 2 as SlotIndex } }],
            [],
        );
        state.players[0].team.forEach((char, idx) =>
            expect(char.hp).toBe([1, 2, 3].includes(idx) ? 40 : 30),
        );
    });
});

// ─── FullTeam effects ─────────────────────────────────────────────────────────

describe('Domain integration — FullTeam effects', () => {
    it('FullTeamDamage deals damage to all 5 enemy characters', () => {
        const fullTeamDmgDie = uniformDie('FullTeamDmg', 1, [{ effect: EffectLabel.FullTeamDamage, magnitude: 6 }], TargetConstraint.ENEMY_ONLY);
        const gameState = createGameState(createPlayer(makeTeam(fullTeamDmgDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [],
        );
        state.players[1].team.forEach(char => expect(char.hp).toBe(44));
    });

    it('FullTeamHeal restores HP to all 5 ally characters including actor', () => {
        const fullTeamHealDie = uniformDie('FullTeamHeal', 1, [{ effect: EffectLabel.FullTeamHeal, magnitude: 12 }], TargetConstraint.ALLY_ONLY);
        let gameState = createGameState(createPlayer(makeTeam(fullTeamHealDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [{
                ...gameState.players[0],
                team: gameState.players[0].team.map(char => ({ ...char, hp: 30 })),
            }, gameState.players[1]] as typeof gameState.players,
        };

        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 0, slot: 0 as SlotIndex } }],
            [],
        );
        state.players[0].team.forEach(char => expect(char.hp).toBe(42)); // 30 + 12
    });

    it('FullTeamShield grants shield to all 5 ally characters', () => {
        const fullTeamShieldDie = uniformDie('FullTeamShield', 1, [{ effect: EffectLabel.FullTeamShield, magnitude: 4 }], TargetConstraint.ALLY_ONLY);
        const gameState = createGameState(createPlayer(makeTeam(fullTeamShieldDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 0, slot: 0 as SlotIndex } }],
            [],
        );
        state.players[0].team.forEach(char => expect(char.shield).toBe(4));
    });
});

// ─── Win conditions ───────────────────────────────────────────────────────────

describe('Domain integration — Win conditions', () => {
    const killDie = uniformDie('Kill', 1, [{ effect: EffectLabel.SingleTargetDamage, magnitude: 50 }], TargetConstraint.ENEMY_ONLY);
    const allSlots = [0, 1, 2, 3, 4] as SlotIndex[];

    it('checkWinner returns 0 when player 1 loses 3 or more characters', () => {
        const gameState = createGameState(createPlayer(makeTeam(killDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            allSlots.map(slot => ({ slot, target: { playerIndex: 1, slot } })),
            [],
        );
        expect(checkWinner(state)).toBe(0);
    });

    it('checkWinner returns 1 when player 0 loses 3 or more characters', () => {
        const gameState = createGameState(createPlayer(makeTeam(noopDie, 0), 0), createPlayer(makeTeam(killDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [],
            allSlots.map(slot => ({ slot, target: { playerIndex: 0, slot } })),
        );
        expect(checkWinner(state)).toBe(1);
    });

    it('checkWinner returns draw when both teams have 3+ dead characters', () => {
        // Resolution order is randomised within a priority bucket, so a simultaneous
        // kill test is non-deterministic. Test checkWinner directly with a
        // known-dead state instead.
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
        const dmgDie = uniformDie('Damage', 1, [{ effect: EffectLabel.SingleTargetDamage, magnitude: 10 }], TargetConstraint.ENEMY_ONLY);
        const gameState = createGameState(createPlayer(makeTeam(dmgDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        const assignPhaseState = advanceToAssign(gameState);
        const { state } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [],
        );
        expect(checkWinner(state)).toBeNull();
    });
});

// ─── Round cleanup and multi-round ────────────────────────────────────────────

describe('Domain integration — Round cleanup and multi-round', () => {
    it('endOfRound resets shields, clears targets, unlocks dice, increments round, restores rollsLeft', () => {
        const dmgDie = uniformDie('Damage', 1, [{ effect: EffectLabel.SingleTargetDamage, magnitude: 5 }], TargetConstraint.ENEMY_ONLY);
        let gameState = createGameState(createPlayer(makeTeam(dmgDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));
        gameState = {
            ...gameState,
            players: [gameState.players[0], {
                ...gameState.players[1],
                team: gameState.players[1].team.map((char, idx) => idx === 0 ? gainShield(char, 8) : char),
            }] as typeof gameState.players,
        };

        const assignPhaseState = advanceToAssign(gameState);
        const { state: resolvedState } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [],
        );

        const nextRoundState = endOfRound(resolvedState);
        expect(nextRoundState.currentRound).toBe(1);
        expect(nextRoundState.rollsLeft).toBe(2);
        nextRoundState.players.forEach(player => player.team.forEach(char => {
            expect(char.shield).toBe(0);
            expect(char.target).toBeNull();
            expect(char.isFaceLocked).toBe(false);
        }));
    });

    it('shield granted in round 1 does not absorb damage in round 2 after endOfRound', () => {
        const selfShieldDie = uniformDie('SelfShield', 2, [{ effect: EffectLabel.SelfShield, magnitude: 10 }], TargetConstraint.NONE);
        const dmgDie        = uniformDie('Damage',     1, [{ effect: EffectLabel.SingleTargetDamage, magnitude: 5 }], TargetConstraint.ENEMY_ONLY);

        const player0Team = [
            createCharacter('Attacker', 50, 0, dmgDie, { playerIndex: 0, slot: 0 as SlotIndex }),
            ...[1, 2, 3, 4].map(idx => createCharacter(`P0S${idx}`, 50, 0, noopDie, { playerIndex: 0, slot: idx as SlotIndex })),
        ];
        const player1Team = [
            createCharacter('Shielder', 50, 0, selfShieldDie, { playerIndex: 1, slot: 0 as SlotIndex }),
            ...[1, 2, 3, 4].map(idx => createCharacter(`P1S${idx}`, 50, 0, noopDie, { playerIndex: 1, slot: idx as SlotIndex })),
        ];
        const gameState = createGameState(createPlayer(player0Team, 0), createPlayer(player1Team, 1));

        // Round 1: P1 slot 0 self-shields (priority 2 fires first), P0 slot 0 deals 5 damage
        let assignPhaseState = advanceToAssign(gameState);
        const { state: round1State } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [],
        );
        // Shield (10) absorbed 5 damage → HP=50, shield=5 remaining
        expect(round1State.players[1].team[0].hp).toBe(50);
        expect(round1State.players[1].team[0].shield).toBe(5);

        // endOfRound: shield resets, next round begins
        const round2GameState = beginPlacementPhase(endOfRound(round1State));
        expect(round2GameState.players[1].team[0].shield).toBe(0);

        // Round 2: same setup. P1 slot 0 self-shields again (priority 2 fires first → shield=10),
        // then P0 deals 5 damage (priority 1) → shield absorbs again
        assignPhaseState = advanceToAssign(round2GameState);
        const { state: round2State } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [],
        );
        expect(round2State.players[1].team[0].hp).toBe(50);  // shield absorbed again

        // If we strip the SelfShield by using a non-shielding P1, HP takes full damage
        const round3GameState = beginPlacementPhase(endOfRound(round2State));
        const player1NoShield = createPlayer(
            [createCharacter('Target', round3GameState.players[1].team[0].hp, 0, noopDie, { playerIndex: 1, slot: 0 as SlotIndex }),
             ...[1,2,3,4].map(idx => createCharacter(`P1S${idx}`, 50, 0, noopDie, { playerIndex: 1, slot: idx as SlotIndex }))],
            1,
        );
        const round3GameStateNoShield = { ...round3GameState, players: [round3GameState.players[0], player1NoShield] as typeof round3GameState.players };
        assignPhaseState = advanceToAssign(round3GameStateNoShield);
        const { state: round3State } = resolveRound(assignPhaseState,
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [],
        );
        expect(round3State.players[1].team[0].hp).toBe(round3GameState.players[1].team[0].hp - 5); // no shield → full damage
    });

    it('damage accumulates correctly across two consecutive rounds', () => {
        const dmgDie = uniformDie('Damage', 1, [{ effect: EffectLabel.SingleTargetDamage, magnitude: 10 }], TargetConstraint.ENEMY_ONLY);
        const initialGameState = createGameState(createPlayer(makeTeam(dmgDie, 0), 0), createPlayer(makeTeam(noopDie, 1), 1));

        // Round 1
        const { state: round1State } = resolveRound(advanceToAssign(initialGameState),
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [],
        );
        expect(round1State.players[1].team[0].hp).toBe(40);

        // Round 2
        const round2GameState = beginPlacementPhase(endOfRound(round1State));
        const { state: round2State } = resolveRound(advanceToAssign(round2GameState),
            [{ slot: 0 as SlotIndex, target: { playerIndex: 1, slot: 0 as SlotIndex } }],
            [],
        );
        expect(round2State.players[1].team[0].hp).toBe(30);
        // endOfRound hasn't been called yet; counter was incremented once (after round 1)
        expect(round2State.currentRound).toBe(1);
    });
});
