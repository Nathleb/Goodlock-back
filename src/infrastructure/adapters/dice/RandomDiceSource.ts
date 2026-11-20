import { Injectable } from '@nestjs/common';
import { DiceSource } from '@domain/types/DiceSource.type';

/** The production dice. */
@Injectable()
export class RandomDiceSource implements DiceSource {
    roll(size: number): number {
        return Math.floor(Math.random() * size);
    }
}
