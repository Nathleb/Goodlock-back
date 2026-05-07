import EffectLabel from "@domain/types/EffectLabels.type";
import EffectFactory from "@domain/factories/EffectFactory.class";
import SingleTargetDamage from "@domain/strategies/SingleTargetDamage.class";
import SingleTargetHeal from "@domain/strategies/SingleTargetHeal.class";
import SingleTargetShield from "@domain/strategies/SingleTargetShield.class";

describe('EffectFactory', () => {
  it('should register and create SingleTargetDamage effect', () => {
    EffectFactory.registerEffect(EffectLabel.SingleTargetDamage, (amount) => new SingleTargetDamage(amount));
    const effect = EffectFactory.createEffect(EffectLabel.SingleTargetDamage, 10);
    expect(effect).toBeInstanceOf(SingleTargetDamage);
  });

  it('should register and create SingleTargetHeal effect', () => {
    EffectFactory.registerEffect(EffectLabel.SingleTargetHeal, (amount) => new SingleTargetHeal(amount));
    const effect = EffectFactory.createEffect(EffectLabel.SingleTargetHeal, 10);
    expect(effect).toBeInstanceOf(SingleTargetHeal);
  });

  it('should register and create SingleTargetShield effect', () => {
    EffectFactory.registerEffect(EffectLabel.SingleTargetShield, (amount) => new SingleTargetShield(amount));
    const effect = EffectFactory.createEffect(EffectLabel.SingleTargetShield, 10);
    expect(effect).toBeInstanceOf(SingleTargetShield);
  });

  it('should unregister an effect', () => {
    EffectFactory.unregisterEffect(EffectLabel.SingleTargetDamage);
    expect(() => EffectFactory.createEffect(EffectLabel.SingleTargetDamage, 10)).toThrow();
  });
});
