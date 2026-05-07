import Effect from "../types/Effect.type";
import EffectLabel from "../types/EffectLabels.type";

export default class EffectFactory {
    private static registry: { [key in EffectLabel]?: (amount: number) => Effect } = {};

    public static registerEffect(effect: EffectLabel, constructorFn: (amount: number) => Effect): void {
        this.registry[effect] = constructorFn;
    }

    public static unregisterEffect(effect: EffectLabel): void {
        delete this.registry[effect];
    }

    public static isEffectRegistered(effect: EffectLabel): boolean {
        return !!this.registry[effect];
    }

    public static createEffect(effect: EffectLabel, amount: number): Effect {
        const constructorFn = this.registry[effect];
        if (!constructorFn) {
            throw new Error("No implementation registered for effect: " + effect);
        }
        return constructorFn(amount);
    }
}
