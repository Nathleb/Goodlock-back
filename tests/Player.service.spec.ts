import EffectLabel from "@domain/types/EffectLabels.type";
import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { hasLost, rollDiceForTurn, selectTargetOfCharacter, createPlayer } from "@domain/services/Player.service";
import { loseHp } from "@domain/services/Character.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { Player } from "@domain/types/Player.type";
import { buildEffectFactory } from "@domain/services/GameInit.service";
import TargetConstraint from "@domain/types/TargetConstraint.type";
import DieFace from "@domain/types/DieFace.type";
import Die from "@domain/types/Die.type";
import Position, { SlotIndex } from "@domain/types/Position.type";

describe('PlayerService', () => {
  const baseDieInstructions: BaseDieInstructions = [
    { description: "Deals 1 damage", priority: 1, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 1 }] },
    { description: "Heals 2 HP", priority: 1, effects: [{ effect: EffectLabel.SingleTargetHeal, magnitude: 2 }] },
    { description: "Grants 3 shield", priority: 1, effects: [{ effect: EffectLabel.SingleTargetShield, magnitude: 3 }] },
    { description: "Deals 4 damage", priority: 2, effects: [{ effect: EffectLabel.SingleTargetDamage, magnitude: 4 }] },
    { description: "Heals 5 HP", priority: 2, effects: [{ effect: EffectLabel.SingleTargetHeal, magnitude: 5 }] },
    { description: "Grants 6 shield", priority: 2, effects: [{ effect: EffectLabel.SingleTargetShield, magnitude: 6 }] },
  ];

  const factory = buildEffectFactory();
  const die = generateFullDie(baseDieInstructions, factory);
  const makeChar = () => createCharacter("TestCharacter", 100, 5, die, { playerIndex: 0, slot: 0 });
  const character = makeChar();
  const player: Player = { playerIndex: 0, team: [character] };

  it('should roll dice for turn', () => {
    const updatedPlayer = rollDiceForTurn(player);
    expect(updatedPlayer.team[0].face).toBeDefined();
  });

  it('should not have lost with fewer than 3 dead characters', () => {
    expect(hasLost(player)).toBe(false);
  });

  it('should have lost when 3 or more characters are dead', () => {
    const dead = loseHp(makeChar(), 100);
    const bigTeam: Player = { playerIndex: 0, team: [dead, dead, dead, makeChar(), makeChar()] };
    expect(hasLost(bigTeam)).toBe(true);
  });

  it('should not have lost with only 2 dead characters', () => {
    const dead = loseHp(makeChar(), 100);
    const bigTeam: Player = { playerIndex: 0, team: [dead, dead, makeChar(), makeChar(), makeChar()] };
    expect(hasLost(bigTeam)).toBe(false);
  });

  describe('selectTargetOfCharacter', () => {
    const baseFace = (constraint: TargetConstraint): DieFace => ({
      priority: 1, effects: [], description: 'test', targetConstraint: constraint,
    });

    it('throws when enemy target given for ALLY_ONLY face', () => {
      const char = createCharacter('A', 100, 5, Array(6).fill(baseFace(TargetConstraint.ALLY_ONLY)) as Die, { playerIndex: 0, slot: 0 });
      const player = createPlayer([char], 0);
      const enemyPos: Position = { playerIndex: 1, slot: 2 };
      expect(() => selectTargetOfCharacter(player, 0 as SlotIndex, enemyPos))
        .toThrow('ALLY_ONLY');
    });

    it('throws when ally target given for ENEMY_ONLY face', () => {
      const char = createCharacter('A', 100, 5, Array(6).fill(baseFace(TargetConstraint.ENEMY_ONLY)) as Die, { playerIndex: 0, slot: 0 });
      const player = createPlayer([char], 0);
      const allyPos: Position = { playerIndex: 0, slot: 1 };
      expect(() => selectTargetOfCharacter(player, 0 as SlotIndex, allyPos))
        .toThrow('ENEMY_ONLY');
    });

    it('throws when any target given for NONE face', () => {
      const char = createCharacter('A', 100, 5, Array(6).fill(baseFace(TargetConstraint.NONE)) as Die, { playerIndex: 0, slot: 0 });
      const player = createPlayer([char], 0);
      const pos: Position = { playerIndex: 0, slot: 1 };
      expect(() => selectTargetOfCharacter(player, 0 as SlotIndex, pos))
        .toThrow('NONE');
    });

    it('accepts ally target for ALLY_ONLY face', () => {
      const char = createCharacter('A', 100, 5, Array(6).fill(baseFace(TargetConstraint.ALLY_ONLY)) as Die, { playerIndex: 0, slot: 0 });
      const player = createPlayer([char], 0);
      const allyPos: Position = { playerIndex: 0, slot: 2 };
      expect(() => selectTargetOfCharacter(player, 0 as SlotIndex, allyPos)).not.toThrow();
    });

    it('accepts enemy target for ANY face', () => {
      const char = createCharacter('A', 100, 5, Array(6).fill(baseFace(TargetConstraint.ANY)) as Die, { playerIndex: 0, slot: 0 });
      const player = createPlayer([char], 0);
      const enemyPos: Position = { playerIndex: 1, slot: 2 };
      expect(() => selectTargetOfCharacter(player, 0 as SlotIndex, enemyPos)).not.toThrow();
    });

    it('returns player unchanged when slot does not exist', () => {
      const char = createCharacter('A', 100, 5, Array(6).fill(baseFace(TargetConstraint.ANY)) as Die, { playerIndex: 0, slot: 0 });
      const player = createPlayer([char], 0);
      const anyPos: Position = { playerIndex: 1, slot: 0 };
      const result = selectTargetOfCharacter(player, 9 as SlotIndex, anyPos);
      expect(result).toBe(player);
    });
  });
});
