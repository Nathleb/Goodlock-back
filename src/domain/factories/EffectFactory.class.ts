import Effect from "../types/Effect.type";
import EffectLabel from "../types/EffectLabels.type";
import { StatName } from "../types/Modifier.type";
import { StateName } from "../types/State.type";

/** Extra template parameters for effects that need more than a magnitude (ApplyStat, ApplyState). */
export type EffectParams = { readonly stat?: StatName; readonly state?: StateName; readonly duration?: number };

type EffectConstructor = (amount: number, params?: EffectParams) => Effect;

export default class EffectFactory {
    private registry: { [key in EffectLabel]?: EffectConstructor } = {};

    public registerEffect(effect: EffectLabel, constructorFn: EffectConstructor): void {
        this.registry[effect] = constructorFn;
    }

    public unregisterEffect(effect: EffectLabel): void {
        delete this.registry[effect];
    }

    public isEffectRegistered(effect: EffectLabel): boolean {
        return !!this.registry[effect];
    }

    public createEffect(effect: EffectLabel, amount: number, params?: EffectParams): Effect {
        const constructorFn = this.registry[effect];
        if (!constructorFn) {
            throw new Error("No implementation registered for effect: " + effect);
        }
        return constructorFn(amount, params);
    }
}
