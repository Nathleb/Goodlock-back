import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength } from 'class-validator';
import { DECK_SIZE } from '@domain/services/Deck.service';

export type DeckDTO = {
    id: string;
    name: string;
    characterIds: string[];   // slot order
    createdAt: string;        // ISO
    updatedAt: string;        // ISO
};

export type DeckListDTO = { decks: DeckDTO[] };

/** Request body shape only; composition rules (ownership, catalog, duplicates) are checked by the coordinator. */
export class SaveDeckDto {
    @IsString()
    @MaxLength(100) // coarse bound; the 1–30 rule applies after trimming, in the coordinator
    name: string;

    @IsArray()
    @ArrayMinSize(DECK_SIZE)
    @ArrayMaxSize(DECK_SIZE)
    @IsString({ each: true })
    characterIds: string[];
}
