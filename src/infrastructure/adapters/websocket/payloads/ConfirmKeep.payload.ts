import { IsArray, IsString } from 'class-validator';

export class ConfirmKeepPayload {
    @IsArray()
    @IsString({ each: true })
    lockedCharacterIds: string[];
}
