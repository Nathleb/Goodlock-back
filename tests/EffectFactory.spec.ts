import EffectFactory from "@domain/factories/EffectFactory.class";
import SingleTargetDamage from "@domain/strategies/SingleTargetDamage.class";
import SingleTargetHeal from "@domain/strategies/SingleTargetHeal.class";
import SingleTargetShield from "@domain/strategies/SingleTargetShield.class";

describe('EffectFactory', () => {
  it('should register and create SingleTargetDamage effect', () => {
    EffectFactory.registerEffect("SingleTargetDamage", (amount, priority) => new SingleTargetDamage(amount, priority));
    const effect = EffectFactory.createEffect("SingleTargetDamage", 10, 1);
    expect(effect).toBeInstanceOf(SingleTargetDamage);
  });

  it('should register and create SingleTargetHeal effect', () => {
    EffectFactory.registerEffect("SingleTargetHeal", (amount, priority) => new SingleTargetHeal(amount, priority));
    const effect = EffectFactory.createEffect("SingleTargetHeal", 10, 1);
    expect(effect).toBeInstanceOf(SingleTargetHeal);
  });

  it('should register and create SingleTargetShield effect', () => {
    EffectFactory.registerEffect("SingleTargetShield", (amount, priority) => new SingleTargetShield(amount, priority));
    const effect = EffectFactory.createEffect("SingleTargetShield", 10, 1);
    expect(effect).toBeInstanceOf(SingleTargetShield);
  });

  it('should unregister an effect', () => {
    EffectFactory.unregisterEffect("SingleTargetDamage");
    expect(() => EffectFactory.createEffect("SingleTargetDamage", 10, 1)).toThrow();
  });
});
