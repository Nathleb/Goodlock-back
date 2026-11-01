import { TEST_CATALOG_ID } from './helpers/catalog';
import EffectLabel from "@domain/types/EffectLabels.type";
import { enemyRel, allyRel } from "./helpers/targets";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { allDiceLocked, hasLost, rollDiceForTurn } from "@domain/services/Player.service";
import { loseHp } from "@domain/services/Character.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { Player } from "@domain/types/Player.type";

describe('PlayerService', () => {
  const baseDieInstructions: BaseDieInstructions = [
    { description: "Deals 1 damage", priority: 1, effects: [{ effect: EffectLabel.Damage, magnitude: 1, targets: [enemyRel(0)] }] },
    { description: "Heals 2 HP", priority: 1, effects: [{ effect: EffectLabel.Heal, magnitude: 2, targets: [allyRel(0)] }] },
    { description: "Grants 3 shield", priority: 1, effects: [{ effect: EffectLabel.Shield, magnitude: 3, targets: [allyRel(0)] }] },
    { description: "Deals 4 damage", priority: 2, effects: [{ effect: EffectLabel.Damage, magnitude: 4, targets: [enemyRel(0)] }] },
    { description: "Heals 5 HP", priority: 2, effects: [{ effect: EffectLabel.Heal, magnitude: 5, targets: [allyRel(0)] }] },
    { description: "Grants 6 shield", priority: 2, effects: [{ effect: EffectLabel.Shield, magnitude: 6, targets: [allyRel(0)] }] },
  ];

  const die = generateFullDie(baseDieInstructions);
  const makeChar = () => createCharacter({ catalogId: TEST_CATALOG_ID, name: "TestCharacter", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });
  const character = makeChar();
  const player: Player = { playerIndex: 0, team: [character] };

  it('should roll dice for turn', () => {
    const updatedPlayer = rollDiceForTurn(player);
    expect(updatedPlayer.team[0].face).toBeDefined();
  });

  it('should not have lost with no dead character', () => {
    expect(hasLost(player)).toBe(false);
  });

  it('should have lost when 2 of the 4 characters are dead', () => {
    const dead = loseHp(makeChar(), 100);
    const team: Player = { playerIndex: 0, team: [dead, dead, makeChar(), makeChar()] };
    expect(hasLost(team)).toBe(true);
  });

  it('should not have lost with only 1 dead character', () => {
    const dead = loseHp(makeChar(), 100);
    const team: Player = { playerIndex: 0, team: [dead, makeChar(), makeChar(), makeChar()] };
    expect(hasLost(team)).toBe(false);
  });

  it('allDiceLocked is true only when every die of the team is locked', () => {
    const locked = (isFaceLocked: boolean) => ({ ...makeChar(), isFaceLocked });
    expect(allDiceLocked({ playerIndex: 0, team: [locked(true), locked(true)] })).toBe(true);
    expect(allDiceLocked({ playerIndex: 0, team: [locked(true), locked(false)] })).toBe(false);
  });
});
