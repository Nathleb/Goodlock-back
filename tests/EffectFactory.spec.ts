import EffectLabel from "@domain/types/EffectLabels.type";
import EffectFactory from "@domain/factories/EffectFactory.class";
import Damage from "@domain/strategies/Damage.class";
import ApplyState from "@domain/strategies/ApplyState.class";
import ApplyStat from "@domain/strategies/ApplyStat.class";
import FixedDamage from "@domain/strategies/FixedDamage.class";
import { buildEffectFactory } from "@domain/services/GameInit.service";
import Heal from "@domain/strategies/Heal.class";
import Shield from "@domain/strategies/Shield.class";
import Swap from "@domain/strategies/Swap.class";

describe('EffectFactory', () => {
  it('should register and create Damage effect', () => {
    const factory = new EffectFactory();
    factory.registerEffect(EffectLabel.Damage, (amount) => new Damage(amount));
    const effect = factory.createEffect(EffectLabel.Damage, 10);
    expect(effect).toBeInstanceOf(Damage);
  });

  it('should register and create FixedDamage effect', () => {
    const factory = new EffectFactory();
    factory.registerEffect(EffectLabel.FixedDamage, (amount) => new FixedDamage(amount));
    const effect = factory.createEffect(EffectLabel.FixedDamage, 10);
    expect(effect).toBeInstanceOf(FixedDamage);
  });

  it('should register and create Heal effect', () => {
    const factory = new EffectFactory();
    factory.registerEffect(EffectLabel.Heal, (amount) => new Heal(amount));
    const effect = factory.createEffect(EffectLabel.Heal, 10);
    expect(effect).toBeInstanceOf(Heal);
  });

  it('should register and create Shield effect', () => {
    const factory = new EffectFactory();
    factory.registerEffect(EffectLabel.Shield, (amount) => new Shield(amount));
    const effect = factory.createEffect(EffectLabel.Shield, 10);
    expect(effect).toBeInstanceOf(Shield);
  });

  it('should register and create Swap effect', () => {
    const factory = new EffectFactory();
    factory.registerEffect(EffectLabel.Swap, () => new Swap());
    const effect = factory.createEffect(EffectLabel.Swap, 0);
    expect(effect).toBeInstanceOf(Swap);
  });

  it('should unregister an effect', () => {
    const factory = new EffectFactory();
    factory.registerEffect(EffectLabel.Damage, (amount) => new Damage(amount));
    factory.unregisterEffect(EffectLabel.Damage);
    expect(() => factory.createEffect(EffectLabel.Damage, 10)).toThrow();
  });

  describe('the factory built for the game', () => {
    it('refuses to create ApplyStat without its stat and duration, with a clear message', () => {
      const factory = buildEffectFactory();
      expect(() => factory.createEffect(EffectLabel.ApplyStat, 3)).toThrow(/ApplyStat needs a stat and a duration/);
      expect(() => factory.createEffect(EffectLabel.ApplyStat, 3, { stat: 'POWER' })).toThrow(/ApplyStat needs a stat and a duration/);
      expect(() => factory.createEffect(EffectLabel.ApplyStat, 3, { duration: 2 })).toThrow(/ApplyStat needs a stat and a duration/);
    });

    it('refuses to create ApplyState without its state and duration, with a clear message', () => {
      const factory = buildEffectFactory();
      expect(() => factory.createEffect(EffectLabel.ApplyState, 0)).toThrow(/ApplyState needs a state and a duration/);
      expect(() => factory.createEffect(EffectLabel.ApplyState, 0, { state: 'STUN' })).toThrow(/ApplyState needs a state and a duration/);
      expect(() => factory.createEffect(EffectLabel.ApplyState, 0, { duration: 1 })).toThrow(/ApplyState needs a state and a duration/);
    });

    it('creates ApplyState when both are given', () => {
      const factory = buildEffectFactory();
      expect(factory.createEffect(EffectLabel.ApplyState, 0, { state: 'STUN', duration: 1 })).toBeInstanceOf(ApplyState);
    });

    it('creates ApplyStat when both are given', () => {
      const factory = buildEffectFactory();
      expect(factory.createEffect(EffectLabel.ApplyStat, 3, { stat: 'POWER', duration: 2 })).toBeInstanceOf(ApplyStat);
    });
  });
});
