import { UserId } from '@shared/branded.types';
import User from '@domain/types/User.type';

export interface UserPort {
    findByUsername(username: string): Promise<User | undefined>;
    findById(id: UserId): Promise<User | undefined>;
    save(user: User): Promise<void>;
    delete(id: UserId): Promise<void>;
}
