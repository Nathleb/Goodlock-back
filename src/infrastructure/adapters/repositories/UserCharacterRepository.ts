import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { CollectionPort, OwnedCharacterRow } from '@application/ports/CollectionPort';
import { CatalogId, UserId } from '@shared/branded.types';

@Injectable()
export class UserCharacterRepository implements CollectionPort {
    constructor(private readonly prisma: PrismaService) {}

    async listOwned(userId: UserId): Promise<readonly OwnedCharacterRow[]> {
        const rows = await this.prisma.userCharacter.findMany({
            where: { userId },
            orderBy: { acquiredAt: 'asc' },
        });
        return rows.map(row => ({ characterId: row.characterId as CatalogId, acquiredAt: row.acquiredAt }));
    }

    async grantMany(userId: UserId, ids: readonly CatalogId[]): Promise<void> {
        if (ids.length === 0) return;
        await this.prisma.userCharacter.createMany({
            data: ids.map(characterId => ({ userId, characterId })),
            skipDuplicates: true,
        });
    }

    async listUnknownIds(known: readonly CatalogId[]): Promise<readonly string[]> {
        const rows = await this.prisma.userCharacter.findMany({
            where: { characterId: { notIn: [...known] } },
            distinct: ['characterId'],
            select: { characterId: true },
        });
        return rows.map(row => row.characterId);
    }
}
