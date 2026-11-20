import { TEST_CATALOG_ID } from './helpers/catalog';
import EffectLabel from "@domain/types/EffectLabels.type";
import { enemyRel, allyRel } from "./helpers/targets";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { createPlayer, hasLost, rollDiceForTurn } from "@domain/services/Player.service";
import { loseHp } from "@domain/services/Character.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { Player } from "@domain/types/Player.type";
import { ScriptedDiceSource } from '@infrastructure/adapters/dice/ScriptedDiceSource';

const dice = ScriptedDiceSource.always(0);

describe('PlayerService', () => {
  const baseDieInstructions: BaseDieInstructions = [
    { description: "Deals 1 damage", priority: 1, effects: [{ targets: [enemyRel(0)], parts: [{ part: EffectLabel.Damage, magnitude: 1 }] }] },
    { description: "Heals 2 HP", priority: 1, effects: [{ targets: [allyRel(0)], parts: [{ part: EffectLabel.Heal, magnitude: 2 }] }] },
    { description: "Grants 3 shield", priority: 1, effects: [{ targets: [allyRel(0)], parts: [{ part: EffectLabel.Shield, magnitude: 3 }] }] },
    { description: "Deals 4 damage", priority: 2, effects: [{ targets: [enemyRel(0)], parts: [{ part: EffectLabel.Damage, magnitude: 4 }] }] },
    { description: "Heals 5 HP", priority: 2, effects: [{ targets: [allyRel(0)], parts: [{ part: EffectLabel.Heal, magnitude: 5 }] }] },
    { description: "Grants 6 shield", priority: 2, effects: [{ targets: [allyRel(0)], parts: [{ part: EffectLabel.Shield, magnitude: 6 }] }] },
  ];

  const die = generateFullDie(baseDieInstructions);
  const makeChar = () => createCharacter({ catalogId: TEST_CATALOG_ID, name: "TestCharacter", maxHp: 100, baseSpeed: 5, baseDie: die, position: { playerIndex: 0, slot: 0 } });
  const character = makeChar();
  const player: Player = { playerIndex: 0, team: [character] };

  it('puts each character on face 0 of its die, index included', () => {
    const rolled = { ...makeChar(), face: die[3], faceIndex: 3 };
    const [placed] = createPlayer([rolled], 1).team;
    expect(placed.faceIndex).toBe(0);
    expect(placed.face).toBe(die[0]);
  });

  it('should roll dice for turn', () => {
    const updatedPlayer = rollDiceForTurn(player, dice);
    expect(updatedPlayer.team[0].face).toBeDefined();
  });

  it('GAME-4: should not have lost with no dead character', () => {
    expect(hasLost(player)).toBe(false);
  });

  it('GAME-4: should have lost when 2 of the 4 characters are dead', () => {
    const dead = loseHp(makeChar(), 100);
    const player: Player = { playerIndex: 0, team: [makeChar(), makeChar()], fallen: [dead, dead] };
    expect(hasLost(player)).toBe(true);
  });

  it('GAME-4: should not have lost with only 1 dead character', () => {
    const dead = loseHp(makeChar(), 100);
    const player: Player = { playerIndex: 0, team: [makeChar(), makeChar(), makeChar()], fallen: [dead] };
    expect(hasLost(player)).toBe(false);
  });
});

describe('GAME-4: a player loses when 2 of their characters are dead', () => {
  const makeChar = () => createCharacter({ catalogId: TEST_CATALOG_ID, name: "C", maxHp: 10, baseSpeed: 1, baseDie: generateFullDie([
    { description: "", priority: 0, effects: [] }, { description: "", priority: 0, effects: [] }, { description: "", priority: 0, effects: [] },
    { description: "", priority: 0, effects: [] }, { description: "", priority: 0, effects: [] }, { description: "", priority: 0, effects: [] },
  ]), position: { playerIndex: 0, slot: 0 } });
  const dead = () => ({ ...makeChar(), hp: 0 });

  it('counts the fallen, not the characters left on the board', () => {
    expect(hasLost({ playerIndex: 0, team: [dead(), dead(), makeChar()] })).toBe(false);
  });

  it('has not lost when nobody has fallen', () => {
    expect(hasLost({ playerIndex: 0, team: [makeChar()] })).toBe(false);
  });
});
