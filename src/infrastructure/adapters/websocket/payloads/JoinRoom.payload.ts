import { IsString } from 'class-validator';

export class JoinRoomPayload {
    @IsString()
    roomId: string;
}
