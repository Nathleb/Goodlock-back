import { validateTarget } from "@domain/services/TargetValidator";
import TargetConstraint from "@domain/types/TargetConstraint.type";
import Position from "@domain/types/Position.type";
import { PlayerIndex } from "@domain/types/Position.type";

const actor: PlayerIndex = 0;
const allyPos: Position = { playerIndex: 0, slot: 2 };
const enemyPos: Position = { playerIndex: 1, slot: 2 };

describe('validateTarget', () => {
    describe('NONE', () => {
        it('accepts null target', () => {
            expect(() => validateTarget(TargetConstraint.NONE, actor, null)).not.toThrow();
        });
        it('throws when a target position is provided', () => {
            expect(() => validateTarget(TargetConstraint.NONE, actor, allyPos))
                .toThrow('NONE');
        });
    });

    describe('ALLY_ONLY', () => {
        it('accepts an ally position', () => {
            expect(() => validateTarget(TargetConstraint.ALLY_ONLY, actor, allyPos)).not.toThrow();
        });
        it('throws on null target', () => {
            expect(() => validateTarget(TargetConstraint.ALLY_ONLY, actor, null)).toThrow();
        });
        it('throws on enemy position', () => {
            expect(() => validateTarget(TargetConstraint.ALLY_ONLY, actor, enemyPos))
                .toThrow('ALLY_ONLY');
        });
    });

    describe('ENEMY_ONLY', () => {
        it('accepts an enemy position', () => {
            expect(() => validateTarget(TargetConstraint.ENEMY_ONLY, actor, enemyPos)).not.toThrow();
        });
        it('throws on null target', () => {
            expect(() => validateTarget(TargetConstraint.ENEMY_ONLY, actor, null)).toThrow();
        });
        it('throws on ally position', () => {
            expect(() => validateTarget(TargetConstraint.ENEMY_ONLY, actor, allyPos))
                .toThrow('ENEMY_ONLY');
        });
    });

    describe('ANY', () => {
        it('accepts an ally position', () => {
            expect(() => validateTarget(TargetConstraint.ANY, actor, allyPos)).not.toThrow();
        });
        it('accepts an enemy position', () => {
            expect(() => validateTarget(TargetConstraint.ANY, actor, enemyPos)).not.toThrow();
        });
        it('throws on null target', () => {
            expect(() => validateTarget(TargetConstraint.ANY, actor, null)).toThrow();
        });
    });
});
