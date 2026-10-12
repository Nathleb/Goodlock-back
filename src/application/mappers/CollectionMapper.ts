import CharacterTemplate from '@domain/types/CharacterTemplate.type';
import { CollectionCharacterDTO } from '@application/dtos/Collection.dto';

// Maps straight from the template: no effect strategies need to be instantiated to describe a die.
export class CollectionMapper {
    static toDTO(template: CharacterTemplate, acquiredAt: Date): CollectionCharacterDTO {
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
                    targets: (e.targets ?? []).map(g => ({ side: g.side, mode: g.mode, n: [...g.n] })),
                })),
            })),
            acquiredAt: acquiredAt.toISOString(),
        };
    }
}
