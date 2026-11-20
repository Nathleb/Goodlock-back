import { Logger } from '@nestjs/common';
import { DiceSource } from '@domain/types/DiceSource.type';
import { RandomDiceSource } from '../adapters/dice/RandomDiceSource';
import { SeededDiceSource } from '../adapters/dice/SeededDiceSource';
import { ScriptedDiceSource } from '../adapters/dice/ScriptedDiceSource';

type EnvLike = { readonly [name: string]: string | undefined };

const INTEGER = /^-?\d+$/;
const INDEX_LIST = /^\s*\d+\s*(,\s*\d+\s*)*$/;

/**
 * The dice of the server. Random in production; `DICE_SEED` replays the same draws (simulating
 * matches in bulk, one match at a time: the source is shared by every room, so concurrent matches
 * interleave their draws); `DICE_SCRIPT` (comma-separated indices) imposes the draws, in order (end-to-end tests).
 */
export function diceSourceFromEnv(env: EnvLike): DiceSource {
    const { DICE_SEED: seed, DICE_SCRIPT: script } = env;
    if ((seed || script) && env.NODE_ENV === 'production') {
        throw new Error('DICE_SEED and DICE_SCRIPT are refused when NODE_ENV=production: the dice must be random');
    }
    if (seed && script) throw new Error('Set either DICE_SEED or DICE_SCRIPT, not both');
    if (seed) {
        if (!INTEGER.test(seed.trim())) throw new Error(`DICE_SEED must be an integer, got: ${seed}`);
        new Logger('Dice').warn(`Seeded dice (DICE_SEED=${seed.trim()}): the draws are predictable`);
        return new SeededDiceSource(Number(seed));
    }
    if (script) {
        if (!INDEX_LIST.test(script)) throw new Error(`DICE_SCRIPT must be a comma-separated list of indices like "5,0,3", got: ${script}`);
        new Logger('Dice').warn('Scripted dice (DICE_SCRIPT): the draws are imposed');
        return new ScriptedDiceSource(script.split(',').map(Number));
    }
    return new RandomDiceSource();
}
