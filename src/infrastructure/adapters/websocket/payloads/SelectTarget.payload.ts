import { IsInt, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class TargetPayload {
    @IsInt()
    playerIndex: number;

    @IsInt()
    slot: number;
}

export class SelectTargetPayload {
    @IsString()
    characterId: string;

    @ValidateNested()
    @Type(() => TargetPayload)
    target: TargetPayload;
}
