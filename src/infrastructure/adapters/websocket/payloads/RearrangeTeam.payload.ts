import { IsArray, IsString } from 'class-validator';

export class RearrangeTeamPayload {
    @IsArray()
    @IsString({ each: true })
    characterIds: string[];
}
