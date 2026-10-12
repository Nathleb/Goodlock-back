import { DeckRecord } from '@application/ports/DeckPort';
import { DeckDTO } from '@application/dtos/Deck.dto';

export class DeckMapper {
    static toDTO(deck: DeckRecord): DeckDTO {
        return {
            id: deck.id,
            name: deck.name,
            characterIds: [...deck.characterIds],
            createdAt: deck.createdAt.toISOString(),
            updatedAt: deck.updatedAt.toISOString(),
        };
    }
}
