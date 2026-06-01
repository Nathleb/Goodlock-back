import EffectLabel from "@domain/types/EffectLabels.type";
import EffectFactory from "@domain/factories/EffectFactory.class";
import SingleTargetDamage from "@domain/strategies/SingleTargetDamage.class";
import SingleTargetHeal from "@domain/strategies/SingleTargetHeal.class";
import SingleTargetShield from "@domain/strategies/SingleTargetShield.class";

describe('EffectFactory', () => {
  it('should register and create SingleTargetDamage effect', () => {
    const factory = new EffectFactory();
    factory.registerEffect(EffectLabel.SingleTargetDamage, (amount) => new SingleTargetDamage(amount));
    const effect = factory.createEffect(EffectLabel.SingleTargetDamage, 10);
    expect(effect).toBeInstanceOf(SingleTargetDamage);
  });

  it('should register and create SingleTargetHeal effect', () => {
    const factory = new EffectFactory();
    factory.registerEffect(EffectLabel.SingleTargetHeal, (amount) => new SingleTargetHeal(amount));
    const effect = factory.createEffect(EffectLabel.SingleTargetHeal, 10);
    expect(effect).toBeInstanceOf(SingleTargetHeal);
  });

  it('should register and create SingleTargetShield effect', () => {
    const factory = new EffectFactory();
    factory.registerEffect(EffectLabel.SingleTargetShield, (amount) => new SingleTargetShield(amount));
    const effect = factory.createEffect(EffectLabel.SingleTargetShield, 10);
    expect(effect).toBeInstanceOf(SingleTargetShield);
  });

  it('should unregister an effect', () => {
    const factory = new EffectFactory();
    factory.registerEffect(EffectLabel.SingleTargetDamage, (amount) => new SingleTargetDamage(amount));
    factory.unregisterEffect(EffectLabel.SingleTargetDamage);
    expect(() => factory.createEffect(EffectLabel.SingleTargetDamage, 10)).toThrow();
  });
});
