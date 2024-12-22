import Effect from "src/types/Effect.type";
import EffectLabels from "src/types/EffectLabels.type";

export default class EffectFactory {
    private static registry: { [key in EffectLabels]?: (amount: number, priority: number) => Effect } = {};

    public static registerEffect(effect: EffectLabels, constructorFn: (amount: number, priority: number) => Effect): void {
        this.registry[effect] = constructorFn;
    }

    public static createEffect(effect: EffectLabels, amount: number, priority: number): Effect {
        const constructorFn = this.registry[effect];
        if (!constructorFn) {
            throw new Error("No implementation registered for effect: " + effect);
        }
        return constructorFn(amount, priority);
    }
}