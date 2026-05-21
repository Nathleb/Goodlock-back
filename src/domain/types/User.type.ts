import { UserId } from '@shared/branded.types';

type User = {
    id: UserId;
    username: string;
    passwordHash: string;
    createdAt: Date;
};

export default User;
