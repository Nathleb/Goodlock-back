import { IsString } from 'class-validator';

export class SelectDeckPayload {
    @IsString()
    deckId: string;
}
