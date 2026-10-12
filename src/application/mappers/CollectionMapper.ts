import CharacterTemplate from '@domain/types/CharacterTemplate.type';
import { CollectionCharacterDTO } from '@application/dtos/Collection.dto';
import { CatalogMapper } from './CatalogMapper';

export class CollectionMapper {
    static toDTO(template: CharacterTemplate, acquiredAt: Date): CollectionCharacterDTO {
        return { ...CatalogMapper.toDTO(template), acquiredAt: acquiredAt.toISOString() };
    }
}
