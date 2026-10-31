import EffectLabel from "@domain/types/EffectLabels.type";
import { effectFor } from "@domain/strategies/effectFor";
import Damage from "@domain/strategies/Damage.class";
import FixedDamage from "@domain/strategies/FixedDamage.class";
import Heal from "@domain/strategies/Heal.class";
import Shield from "@domain/strategies/Shield.class";
import Swap from "@domain/strategies/Swap.class";
import ApplyStat from "@domain/strategies/ApplyStat.class";
import ApplyState from "@domain/strategies/ApplyState.class";

describe('effectFor', () => {
    it('gives each magnitude effect its strategy, built with the magnitude of the face', () => {
        expect(effectFor({ label: EffectLabel.Damage, magnitude: 10 })).toStrictEqual(new Damage(10));
        expect(effectFor({ label: EffectLabel.FixedDamage, magnitude: 4 })).toStrictEqual(new FixedDamage(4));
        expect(effectFor({ label: EffectLabel.Heal, magnitude: 3 })).toStrictEqual(new Heal(3));
        expect(effectFor({ label: EffectLabel.Shield, magnitude: 2 })).toStrictEqual(new Shield(2));
    });

    it('gives Swap its strategy, which has no magnitude', () => {
        expect(effectFor({ label: EffectLabel.Swap, magnitude: 0 })).toStrictEqual(new Swap());
    });

    it('builds ApplyStat with its stat, magnitude and duration', () => {
        expect(effectFor({ label: EffectLabel.ApplyStat, magnitude: 3, stat: 'POWER', duration: 2 }))
            .toStrictEqual(new ApplyStat('POWER', 3, 2));
    });

    it('builds ApplyState with its state and duration', () => {
        expect(effectFor({ label: EffectLabel.ApplyState, magnitude: 0, state: 'STUN', duration: 1 }))
            .toStrictEqual(new ApplyState('STUN', 1));
    });

    it('refuses an unknown label, naming it, so a bad template fails at catalog load', () => {
        expect(() => effectFor({ label: 'Teleport' as EffectLabel, magnitude: 1 })).toThrow(/No strategy for effect: Teleport/);
    });

    it('refuses ApplyStat without its stat and duration, with a clear message', () => {
        expect(() => effectFor({ label: EffectLabel.ApplyStat, magnitude: 3 })).toThrow(/ApplyStat needs a stat and a duration/);
        expect(() => effectFor({ label: EffectLabel.ApplyStat, magnitude: 3, stat: 'POWER' })).toThrow(/ApplyStat needs a stat and a duration/);
        expect(() => effectFor({ label: EffectLabel.ApplyStat, magnitude: 3, duration: 2 })).toThrow(/ApplyStat needs a stat and a duration/);
    });

    it('refuses ApplyState without its state and duration, with a clear message', () => {
        expect(() => effectFor({ label: EffectLabel.ApplyState, magnitude: 0 })).toThrow(/ApplyState needs a state and a duration/);
        expect(() => effectFor({ label: EffectLabel.ApplyState, magnitude: 0, state: 'STUN' })).toThrow(/ApplyState needs a state and a duration/);
        expect(() => effectFor({ label: EffectLabel.ApplyState, magnitude: 0, duration: 1 })).toThrow(/ApplyState needs a state and a duration/);
    });
});
