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
                    targets: (e.targets ?? []).map(g => ({ side: g.side, mode: g.mode, n: [...g.n] })),
                    parts: e.parts.map(part => ({
                        part: part.part,
                        magnitude: part.part === EffectLabel.ApplyState ? 0 : part.magnitude,
                        ...(part.part === EffectLabel.ApplyStat && { stat: part.stat, duration: part.duration }),
                        ...(part.part === EffectLabel.ApplyState && { state: part.state, duration: part.duration }),
                    })),
                })),
            })),
        };
    }
}
