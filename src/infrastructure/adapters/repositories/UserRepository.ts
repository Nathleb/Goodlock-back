import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { UserPort } from '@application/ports/UserPort';
import { UserId } from '@shared/branded.types';
import User from '@domain/types/User.type';

@Injectable()
export class UserRepository implements UserPort {
    constructor(private readonly prisma: PrismaService) {}

    async findByUsername(username: string): Promise<User | undefined> {
        const row = await this.prisma.user.findUnique({ where: { username } });
        return row ? this.toUser(row) : undefined;
    }

    async findById(id: UserId): Promise<User | undefined> {
        const row = await this.prisma.user.findUnique({ where: { id } });
        return row ? this.toUser(row) : undefined;
    }

    async save(user: User): Promise<void> {
        await this.prisma.user.upsert({
            where: { id: user.id },
            update: { username: user.username, passwordHash: user.passwordHash },
            create: { id: user.id, username: user.username, passwordHash: user.passwordHash, createdAt: user.createdAt },
        });
    }

    async delete(id: UserId): Promise<void> {
        await this.prisma.user.delete({ where: { id } });
    }

    private toUser(row: { id: string; username: string; passwordHash: string; createdAt: Date }): User {
        return {
            id: row.id as UserId,
            username: row.username,
            passwordHash: row.passwordHash,
            createdAt: row.createdAt,
        };
    }
}
