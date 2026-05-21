import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
    @IsString()
    @MinLength(3)
    @MaxLength(20)
    @Matches(/^[a-zA-Z0-9_]+$/, { message: 'username can only contain letters, numbers and underscores' })
    username: string;

    @IsString()
    @MinLength(8)
    @MaxLength(72)
    password: string;
}
