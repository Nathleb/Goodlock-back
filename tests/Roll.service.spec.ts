import { TEST_CATALOG_ID } from './helpers/catalog';
import EffectLabel from "@domain/types/EffectLabels.type";
import { enemyRel, allyRel } from "./helpers/targets";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createGameState, buildEffectFactory } from "@domain/services/GameInit.service";
import { createPlayer } from "@domain/services/Player.service";
import { canReroll, reroll } from "@domain/services/Roll.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";

const baseDieInstructions: BaseDieInstructions = [
    { description: "Damage", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyRel(0)] }] },
    { description: "Heal", priority: 1, effects: [{ effect: EffectLabel.Heal, magnitude: 5, targets: [allyRel(0)] }] },
    { description: "Shield", priority: 1, effects: [{ effect: EffectLabel.Shield, magnitude: 5, targets: [allyRel(0)] }] },
    { description: "Damage", priority: 2, effects: [{ effect: EffectLabel.Damage, magnitude: 5, targets: [enemyRel(0)] }] },
    { description: "Heal", priority: 2, effects: [{ effect: EffectLabel.Heal, magnitude: 5, targets: [allyRel(0)] }] },
    { description: "Shield", priority: 2, effects: [{ effect: EffectLabel.Shield, magnitude: 5, targets: [allyRel(0)] }] },
];

const factory = buildEffectFactory();
const die = generateFullDie(baseDieInstructions, factory);
const makeChar = () => createCharacter({ catalogId: TEST_CATALOG_ID, name: "C", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });
const makeTeam = () => [makeChar(), makeChar(), makeChar(), makeChar(), makeChar()];

describe('Roll.service', () => {
    it('should allow reroll when rollsLeft > 0', () => {
        const gs = createGameState(createPlayer(makeTeam(), 0), createPlayer(makeTeam(), 1));
        expect(canReroll(gs)).toBe(true);
    });

    it('should deny reroll when rollsLeft is 0', () => {
        const gs = { ...createGameState(createPlayer(makeTeam(), 0), createPlayer(makeTeam(), 1)), rollsLeft: 0 };
        expect(canReroll(gs)).toBe(false);
    });

    it('should decrement rollsLeft after reroll', () => {
        const gs = createGameState(createPlayer(makeTeam(), 0), createPlayer(makeTeam(), 1));
        const updated = reroll(gs, 0);
        expect(updated.rollsLeft).toBe(gs.rollsLeft - 1);
    });

    it('should not roll locked dice', () => {
        const team = makeTeam();
        let player = createPlayer(team, 0);
        player = { ...player, team: player.team.map((c, i) => i === 0 ? { ...c, isFaceLocked: true } : c) };
        const lockedFace = player.team[0].face;
        const gs = createGameState(player, createPlayer(makeTeam(), 1));

        const updated = reroll(gs, 0);

        expect(updated.players[0].team[0].face).toBe(lockedFace);
    });

    it('should only affect the specified player', () => {
        const gs = createGameState(createPlayer(makeTeam(), 0), createPlayer(makeTeam(), 1));
        const p2teamBefore = gs.players[1].team.map(c => c.face);

        const updated = reroll(gs, 0);

        updated.players[1].team.forEach((char, i) =>
            expect(char.face).toBe(p2teamBefore[i])
        );
    });

    it('should throw when no rolls remain', () => {
        const gs = { ...createGameState(createPlayer(makeTeam(), 0), createPlayer(makeTeam(), 1)), rollsLeft: 0 };
        expect(() => reroll(gs, 0)).toThrow('No rolls left');
    });
});
