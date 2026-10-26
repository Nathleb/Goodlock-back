import EffectLabel from "@domain/types/EffectLabels.type";
import EffectFactory from "@domain/factories/EffectFactory.class";
import Damage from "@domain/strategies/Damage.class";
import FixedDamage from "@domain/strategies/FixedDamage.class";
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
});
