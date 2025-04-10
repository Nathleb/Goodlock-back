import { createCharacter, generateFullDie } from "@domain/services/CharacterGeneration.service";
import { hasLost, rollDiceForTurn, toggleDieLockForCharacter } from "@domain/services/Player.service";
import { BaseDieInstructions } from "@domain/types/BaseDieInstructions.type";
import { Player } from "@domain/types/Player.type";
import { initializeEffects } from "@domain/services/GameInit.service";

describe('PlayerService', () => {
  const baseDieInstructions: BaseDieInstructions = {
    "0": { description: "Deals 1 damage", effects: [{ effect: "SingleTargetDamage", magnitude: 1, priority: 1 }] },
    "1": { description: "Heals 2 HP", effects: [{ effect: "SingleTargetHeal", magnitude: 2, priority: 1 }] },
    "2": { description: "Grants 3 shield", effects: [{ effect: "SingleTargetShield", magnitude: 3, priority: 1 }] },
    "3": { description: "Deals 4 damage", effects: [{ effect: "SingleTargetDamage", magnitude: 4, priority: 1 }] },
    "4": { description: "Heals 5 HP", effects: [{ effect: "SingleTargetHeal", magnitude: 5, priority: 1 }] },
    "5": { description: "Grants 6 shield", effects: [{ effect: "SingleTargetShield", magnitude: 6, priority: 1 }] }
  };

  initializeEffects();
  const die = generateFullDie(baseDieInstructions);
  const character = createCharacter("TestCharacter", 100, die, { playerIndex: 0, characterIndex: 0 });
  const player: Player = { playerIndex: 0, team: [character] };

  it('should toggle die lock for character', () => {
    const updatedPlayer = toggleDieLockForCharacter(player, { playerIndex: 0, characterIndex: 0 });
    expect(updatedPlayer.team[0].isFaceLocked).toBe(true);
  });

  it('should roll dice for turn', () => {
    const updatedPlayer = rollDiceForTurn(player);
    expect(updatedPlayer.team[0].face).toBeDefined();
  });

  it('should check if player has lost', () => {
    const lost = hasLost(player);
    expect(lost).toBe(false);
  });
});
