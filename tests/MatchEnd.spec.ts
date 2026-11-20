import { TEST_CATALOG_ID } from './helpers/catalog';
import EffectLabel from "@domain/types/EffectLabels.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState } from "./helpers/gameState";
import { createPlayer } from "@domain/services/Player.service";
import { addAllEffectsToPriorityQueue, unstackPriorityQueueWithLog } from "@domain/services/PriorityQueue.service";
import { BaseDieInstructions, EffectEntry } from "@domain/types/BaseDieInstructions.type";
import DieFace from "@domain/types/DieFace.type";
import { Player } from "@domain/types/Player.type";
import GameState from "@domain/types/GameState.type";
import { PlayerIndex, SlotIndex } from "@domain/types/Position.type";
import { enemyAbs, allyAbs } from "./helpers/targets";

const face = (priority: number, effects: EffectEntry[]) =>
    generateFullDie(Array(6).fill({ description: 'f', priority, effects }) as unknown as BaseDieInstructions)[0];
const idle = face(0, []);
const mk = (name: string, f: DieFace, pi: PlayerIndex, slot: number) =>
    ({ ...createCharacter({ catalogId: TEST_CATALOG_ID, name, maxHp: 20, baseSpeed: 1, baseDie: [f, f, f, f, f, f], position: { playerIndex: pi, slot: slot as SlotIndex } }), face: f });
const teamOf = (pi: PlayerIndex, overrides: Record<number, DieFace> = {}): Player =>
    createPlayer([0, 1, 2, 3, 4].map(s => mk(`${pi}-${s}`, overrides[s] ?? idle, pi, s)), pi);
/** The last `n` characters of the team already died: they are among the fallen, their cells are empty. */
const withFallen = (player: Player, n: number): Player => ({
    ...player,
    team: player.team.slice(0, player.team.length - n),
    fallen: player.team.slice(player.team.length - n).map(c => ({ ...c, hp: 0 })),
});
const run = (p0: Player, p1: Player) => unstackPriorityQueueWithLog(addAllEffectsToPriorityQueue(createGameState(p0, p1)));
const killing = (...targets: ReturnType<typeof enemyAbs>[]): EffectEntry[] =>
    targets.map(t => ({ targets: [t], parts: [{ part: EffectLabel.Damage, magnitude: 99 }] }));
const cell = (s: GameState, pi: PlayerIndex, slot: number) => s.players[pi].team.find(c => c.position.slot === slot);

describe('END-1, RES-4: the match ends as soon as a player loses', () => {
    it('stops the resolution at the effect that gives the second death: the rest of the face and of the round is not played', () => {
        const killer = face(1, killing(enemyAbs(0), enemyAbs(1), enemyAbs(2)));
        const late = face(0, [{ targets: [enemyAbs(0)], parts: [{ part: EffectLabel.Damage, magnitude: 9 }] }]);
        const p0 = teamOf(0, { 0: killer });
        const p1 = teamOf(1, { 3: late });

        const { state, log } = run(p0, p1);

        expect(state.players[1].fallen).toHaveLength(2);
        expect(cell(state, 1, 2)?.hp).toBe(20);
        expect(cell(state, 0, 0)?.hp).toBe(20);
        // The log still lists every entry: the 9 the decided match did not play are unplayed.
        expect(log).toHaveLength(10);
        expect(log[0]).toMatchObject({ characterId: p0.team[0].id, unplayed: false });
        expect(log[0].effects).toHaveLength(2);
        expect(log.slice(1).every(s => s.unplayed && s.skipped && s.effects.length === 0 && s.changes.length === 0)).toBe(true);
        expect(state.winner).toBe(0);
    });

    it('does not decide anything while nobody has 2 dead characters', () => {
        const killer = face(1, killing(enemyAbs(0)));

        const { state, log } = run(teamOf(0, { 0: killer }), teamOf(1));

        expect(state.players[1].fallen).toHaveLength(1);
        expect(log).toHaveLength(10);
        expect(state.winner).toBeUndefined();
    });
});

describe('RES-2, DEAD-1: the killing blow in the log', () => {
    it('names the character who died, not one who fell before', () => {
        const p0 = teamOf(0, { 0: face(1, killing(enemyAbs(0))) });
        const p1 = withFallen(teamOf(1), 1);

        const { log } = run(p0, p1);

        const step = log.find(s => s.characterId === p0.team[0].id)!;
        expect(step.changes.map(c => c.characterId)).toEqual([p1.team[0].id]);
        expect(step.changes[0].character.hp).toBe(0);
    });
});

describe('END-2: deaths are checked after each effect', () => {
    it('the first player to have 2 dead characters loses', () => {
        const p0 = teamOf(0, { 0: face(1, killing(enemyAbs(0))) });
        const p1 = withFallen(teamOf(1), 1);

        const { state } = run(p0, p1);

        expect(state.winner).toBe(0);
    });

    it('a player whose own effect gives them their second death loses before the rest of the face applies', () => {
        // "lose 3 HP, then deal 9 to the enemy in front": the second death of the author stops the face.
        const selfCost = face(1, [
            { targets: [allyAbs(1)], parts: [{ part: EffectLabel.FixedDamage, magnitude: 20 }] },
            { targets: [enemyAbs(0)], parts: [{ part: EffectLabel.Damage, magnitude: 9 }] },
        ]);
        const p0 = withFallen(teamOf(0, { 0: selfCost }), 1);

        const { state } = run(p0, teamOf(1));

        expect(state.winner).toBe(1);
        expect(cell(state, 1, 0)?.hp).toBe(20);
    });

    it.each([0, 1] as const)('when one effect gives both players their second death, its author loses (author: player %i)', (author) => {
        const bothDie = face(1, [{ targets: [allyAbs(1), enemyAbs(1)], parts: [{ part: EffectLabel.Damage, magnitude: 99 }] }]);
        const overrides = { 0: bothDie };
        const authorTeam = withFallen(teamOf(author, overrides), 1);
        const otherTeam = withFallen(teamOf((1 - author) as PlayerIndex), 1);

        const { state } = author === 0 ? run(authorTeam, otherTeam) : run(otherTeam, authorTeam);

        expect(state.players[0].fallen).toHaveLength(2);
        expect(state.players[1].fallen).toHaveLength(2);
        expect(state.winner).toBe(1 - author);
    });

    it('END-2: when one effect gives both players their second death, the match has a winner: a draw only comes from time', () => {
        const bothDie = face(1, [{ targets: [allyAbs(1), enemyAbs(1)], parts: [{ part: EffectLabel.Damage, magnitude: 99 }] }]);

        const { state } = run(withFallen(teamOf(0, { 0: bothDie }), 1), withFallen(teamOf(1), 1));

        expect([0, 1]).toContain(state.winner);
    });
});
