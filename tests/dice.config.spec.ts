import { diceSourceFromEnv } from '@infrastructure/config/dice.config';
import { RandomDiceSource } from '@infrastructure/adapters/dice/RandomDiceSource';
import { SeededDiceSource } from '@infrastructure/adapters/dice/SeededDiceSource';

describe('diceSourceFromEnv', () => {
    it('gives the random dice when nothing is set', () => {
        expect(diceSourceFromEnv({})).toBeInstanceOf(RandomDiceSource);
    });

    it('treats empty values as unset', () => {
        expect(diceSourceFromEnv({ DICE_SEED: '', DICE_SCRIPT: '' })).toBeInstanceOf(RandomDiceSource);
    });

    it('gives seeded dice for DICE_SEED', () => {
        const dice = diceSourceFromEnv({ DICE_SEED: '42' });
        expect(dice).toBeInstanceOf(SeededDiceSource);
        const again = diceSourceFromEnv({ DICE_SEED: '42' });
        expect([dice.roll(6), dice.roll(6), dice.roll(6)]).toEqual([again.roll(6), again.roll(6), again.roll(6)]);
    });

    it('rejects a DICE_SEED that is not an integer', () => {
        expect(() => diceSourceFromEnv({ DICE_SEED: 'abc' })).toThrow('DICE_SEED must be an integer');
        expect(() => diceSourceFromEnv({ DICE_SEED: '1.5' })).toThrow('DICE_SEED must be an integer');
    });

    it('gives scripted dice for DICE_SCRIPT, drawing the listed indices in order', () => {
        const dice = diceSourceFromEnv({ DICE_SCRIPT: '1, 5,0' });
        expect([dice.roll(2), dice.roll(6), dice.roll(6)]).toEqual([1, 5, 0]);
        expect(() => dice.roll(6)).toThrow('script is used up');
    });

    it('rejects a DICE_SCRIPT that is not a list of indices', () => {
        expect(() => diceSourceFromEnv({ DICE_SCRIPT: '1,x' })).toThrow('DICE_SCRIPT must be');
        expect(() => diceSourceFromEnv({ DICE_SCRIPT: '1,,2' })).toThrow('DICE_SCRIPT must be');
        expect(() => diceSourceFromEnv({ DICE_SCRIPT: '-1' })).toThrow('DICE_SCRIPT must be');
    });

    it('refuses seeded and scripted dice when NODE_ENV is production', () => {
        expect(() => diceSourceFromEnv({ NODE_ENV: 'production', DICE_SEED: '1' })).toThrow('NODE_ENV=production');
        expect(() => diceSourceFromEnv({ NODE_ENV: 'production', DICE_SCRIPT: '1' })).toThrow('NODE_ENV=production');
        expect(diceSourceFromEnv({ NODE_ENV: 'production' })).toBeInstanceOf(RandomDiceSource);
    });

    it('refuses both at once', () => {
        expect(() => diceSourceFromEnv({ DICE_SEED: '1', DICE_SCRIPT: '1' })).toThrow('either');
    });
});
