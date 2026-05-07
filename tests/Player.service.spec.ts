import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { hasLost, rollDiceForTurn, toggleDieLockForCharacter } from "@domain/services/Player.service";
import { loseHp } from "@domain/services/Character.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { Player } from "@domain/types/Player.type";
import { initializeEffects } from "@domain/services/GameInit.service";

describe('PlayerService', () => {
  const baseDieInstructions: BaseDieInstructions = [
    { description: "Deals 1 damage", priority: 1, effects: [{ effect: "SingleTargetDamage", magnitude: 1 }] },
    { description: "Heals 2 HP", priority: 1, effects: [{ effect: "SingleTargetHeal", magnitude: 2 }] },
    { description: "Grants 3 shield", priority: 1, effects: [{ effect: "SingleTargetShield", magnitude: 3 }] },
    { description: "Deals 4 damage", priority: 2, effects: [{ effect: "SingleTargetDamage", magnitude: 4 }] },
    { description: "Heals 5 HP", priority: 2, effects: [{ effect: "SingleTargetHeal", magnitude: 5 }] },
    { description: "Grants 6 shield", priority: 2, effects: [{ effect: "SingleTargetShield", magnitude: 6 }] },
  ];

  initializeEffects();
  const die = generateFullDie(baseDieInstructions);
  const makeChar = () => createCharacter("TestCharacter", 100, 5, die, { playerIndex: 0, slot: 0 });
  const character = makeChar();
  const player: Player = { playerIndex: 0, team: [character] };

  it('should toggle die lock for character', () => {
    const updatedPlayer = toggleDieLockForCharacter(player, { playerIndex: 0, slot: 0 });
    expect(updatedPlayer.team[0].isFaceLocked).toBe(true);
  });

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
});
