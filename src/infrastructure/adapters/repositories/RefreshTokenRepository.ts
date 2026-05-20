import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { RefreshTokenPort, RefreshTokenRecord } from '@application/ports/RefreshTokenPort';
import { UserId } from '@shared/branded.types';

@Injectable()
export class RefreshTokenRepository implements RefreshTokenPort {
    constructor(private readonly prisma: PrismaService) {}

    async save(tokenHash: string, userId: UserId, expiresAt: Date): Promise<void> {
        await this.prisma.refreshToken.create({
            data: { tokenHash, userId, expiresAt },
        });
    }

    async findByHash(tokenHash: string): Promise<RefreshTokenRecord | undefined> {
        const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
        if (!row) return undefined;
        return {
            userId: row.userId as UserId,
            expiresAt: row.expiresAt,
            isRevoked: row.isRevoked,
        };
    }

    async revokeByHash(tokenHash: string): Promise<void> {
        await this.prisma.refreshToken.update({
            where: { tokenHash },
            data: { isRevoked: true },
        });
    }

    async deleteByHash(tokenHash: string): Promise<void> {
        await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
    }

    async deleteAllForUser(userId: UserId): Promise<void> {
        await this.prisma.refreshToken.deleteMany({ where: { userId } });
    }
}
