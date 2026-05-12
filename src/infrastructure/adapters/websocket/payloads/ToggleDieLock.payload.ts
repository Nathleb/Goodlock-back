import { IsString } from 'class-validator';

export class ToggleDieLockPayload {
    @IsString()
    characterId: string;
}
