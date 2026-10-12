import { IsArray, IsString } from 'class-validator';

export class ConfirmSelectionPayload {
    @IsArray()
    @IsString({ each: true })
    characterIds: string[];
}
