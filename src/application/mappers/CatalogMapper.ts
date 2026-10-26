import CharacterTemplate from '@domain/types/CharacterTemplate.type';
import EffectLabel from '@domain/types/EffectLabels.type';
import { CatalogCharacterDTO } from '@application/dtos/Catalog.dto';

// Maps straight from the template: no effect strategies need to be instantiated to describe a die.
export class CatalogMapper {
    static toDTO(template: CharacterTemplate): CatalogCharacterDTO {
        return {
            id: template.id,
            name: template.name,
            maxHp: template.maxHp,
            baseSpeed: template.baseSpeed,
            baseDie: template.baseDieInstructions.map(face => ({
                description: face.description,
                priority: face.priority,
                effects: face.effects.map(e => ({
                    effect: e.effect,
                    magnitude: e.magnitude,
                    ...(e.effect === EffectLabel.ApplyStat && { stat: e.stat, duration: e.duration }),
                    targets: (e.targets ?? []).map(g => ({ side: g.side, mode: g.mode, n: [...g.n] })),
                })),
            })),
        };
    }
}
