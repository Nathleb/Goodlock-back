import { toggleDieLockForCharacter, selectCurrentTargetOfCharacter, rollDiceForTurn, hasLost } from "../src/services/Player.service";
import { createCharacter, generateFullDie } from "../src/services/CharacterGeneration.service";
import { Player } from "../src/types/Player.type";
import { BaseDieInstructions } from "../src/types/BaseDieInstructions.type";

describe('PlayerService', () => {
  const baseDieInstructions: BaseDieInstructions = {
    "0": [{ effect: "SingleTargetDamage", magnitude: 1, priority: 1 }],
    "1": [{ effect: "SingleTargetHeal", magnitude: 2, priority: 1 }],
    "2": [{ effect: "SingleTargetShield", magnitude: 3, priority: 1 }],
    "3": [{ effect: "SingleTargetDamage", magnitude: 4, priority: 1 }],
    "4": [{ effect: "SingleTargetHeal", magnitude: 5, priority: 1 }],
    "5": [{ effect: "SingleTargetShield", magnitude: 6, priority: 1 }]
  };

  const die = generateFullDie(baseDieInstructions);
  const character = createCharacter("TestCharacter", 100, die, { playerIndex: 0, characterIndex: 0 });
  const player: Player = { playerIndex: 0, team: [character] };

  it('should toggle die lock for character', () => {
    const updatedPlayer = toggleDieLockForCharacter(player, { playerIndex: 0, characterIndex: 0 });
    expect(updatedPlayer.team[0].isFaceLocked).toBe(true);
  });

  it('should select current target of character', () => {
    const updatedPlayer = selectCurrentTargetOfCharacter(player, { playerIndex: 0, characterIndex: 0 }, { playerIndex: 1, characterIndex: 0 });
    expect(updatedPlayer.team[0].currentTarget).toEqual({ playerIndex: 1, characterIndex: 0 });
  });

  it('should roll dice for turn', () => {
    const updatedPlayer = rollDiceForTurn(player);
    expect(updatedPlayer.team[0].currentFace).toBeDefined();
  });

  it('should check if player has lost', () => {
    const lost = hasLost(player);
    expect(lost).toBe(false);
  });
});
