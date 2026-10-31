import Effect from "../types/Effect.type";
import EffectLabel from "../types/EffectLabels.type";
import { FaceEffect } from "../types/DieFace.type";
import Damage from "./Damage.class";
import FixedDamage from "./FixedDamage.class";
import Heal from "./Heal.class";
import Shield from "./Shield.class";
import Swap from "./Swap.class";
import ApplyStat from "./ApplyStat.class";
import ApplyState from "./ApplyState.class";

/** What a strategy is built from: the data of one face effect. */
export type EffectSpec = Pick<FaceEffect, 'label' | 'magnitude' | 'stat' | 'state' | 'duration'>;

/**
 * The strategy that applies a face effect. The set of effects is closed (`EffectLabel`): a new
 * label does not compile until it has its case here. Throws on a face effect missing the
 * parameters its strategy needs, which only a bad template can produce (checked at catalog load).
 */
export function effectFor(spec: EffectSpec): Effect {
    switch (spec.label) {
        case EffectLabel.Damage: return new Damage(spec.magnitude);
        case EffectLabel.FixedDamage: return new FixedDamage(spec.magnitude);
        case EffectLabel.Heal: return new Heal(spec.magnitude);
        case EffectLabel.Shield: return new Shield(spec.magnitude);
        case EffectLabel.Swap: return new Swap();
        case EffectLabel.ApplyStat:
            if (!spec.stat || spec.duration === undefined) throw new Error("ApplyStat needs a stat and a duration");
            return new ApplyStat(spec.stat, spec.magnitude, spec.duration);
        case EffectLabel.ApplyState:
            if (!spec.state || spec.duration === undefined) throw new Error("ApplyState needs a state and a duration");
            return new ApplyState(spec.state, spec.duration);
        default: {
            const unknown: never = spec.label;
            throw new Error(`No strategy for effect: ${String(unknown)}`);
        }
    }
}
