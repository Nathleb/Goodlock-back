import { UserId } from '@shared/branded.types';

export interface RefreshTokenRecord {
    userId: UserId;
    expiresAt: Date;
    isRevoked: boolean;
}

export interface RefreshTokenPort {
    save(tokenHash: string, userId: UserId, expiresAt: Date): Promise<void>;
    findByHash(tokenHash: string): Promise<RefreshTokenRecord | undefined>;
    revokeByHash(tokenHash: string): Promise<void>;
    deleteByHash(tokenHash: string): Promise<void>;
    deleteAllForUser(userId: UserId): Promise<void>;
}
