import { IsArray, IsInt, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class AssignmentTargetPosition {
    @IsInt()
    playerIndex: number;

    @IsInt()
    slot: number;
}

class AssignmentTarget {
    @IsString()
    characterId: string;

    @ValidateNested()
    @Type(() => AssignmentTargetPosition)
    target: AssignmentTargetPosition;
}

export class ConfirmAssignmentPayload {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AssignmentTarget)
    targets: AssignmentTarget[];
}
