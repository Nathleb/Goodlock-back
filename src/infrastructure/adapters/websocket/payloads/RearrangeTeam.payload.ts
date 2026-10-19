import { IsArray } from 'class-validator';

export class RearrangeTeamPayload {
    /** The board, cell by cell: a character ID, or null for an empty cell. Validated by placeTeam. */
    @IsArray()
    slots: (string | null)[];
}
