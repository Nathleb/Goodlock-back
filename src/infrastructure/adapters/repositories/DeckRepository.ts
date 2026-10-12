import { Injectable } from '@nestjs/common';
import { Deck, DeckSlot } from '@prisma/client';
import { PrismaService } from '@infrastructure/prisma/prisma.service';
import { DeckContent, DeckPort, DeckRecord } from '@application/ports/DeckPort';
import { CatalogId, DeckId, UserId } from '@shared/branded.types';

const WITH_SLOTS = { slots: { orderBy: { position: 'asc' } } } as const;

@Injectable()
export class DeckRepository implements DeckPort {
    constructor(private readonly prisma: PrismaService) {}

    async listByUser(userId: UserId): Promise<readonly DeckRecord[]> {
        const rows = await this.prisma.deck.findMany({ where: { userId }, include: WITH_SLOTS, orderBy: { createdAt: 'asc' } });
        return rows.map(toRecord);
    }

    async findById(id: DeckId): Promise<DeckRecord | undefined> {
        const row = await this.prisma.deck.findUnique({ where: { id }, include: WITH_SLOTS });
        return row ? toRecord(row) : undefined;
    }

    countByUser(userId: UserId): Promise<number> {
        return this.prisma.deck.count({ where: { userId } });
    }

    async create(userId: UserId, content: DeckContent): Promise<DeckRecord> {
        const row = await this.prisma.deck.create({
            data: { userId, name: content.name, slots: { create: toSlots(content) } },
            include: WITH_SLOTS,
        });
        return toRecord(row);
    }

    async update(id: DeckId, content: DeckContent): Promise<DeckRecord> {
        const row = await this.prisma.$transaction(async tx => {
            await tx.deckSlot.deleteMany({ where: { deckId: id } });
            return tx.deck.update({
                where: { id },
                data: { name: content.name, slots: { create: toSlots(content) } },
                include: WITH_SLOTS,
            });
        });
        return toRecord(row);
    }

    async delete(id: DeckId): Promise<void> {
        await this.prisma.deck.delete({ where: { id } });
    }
}

function toSlots(content: DeckContent) {
    return content.characterIds.map((characterId, position) => ({ position, characterId }));
}

function toRecord(row: Deck & { slots: DeckSlot[] }): DeckRecord {
    return {
        id: row.id as DeckId,
        userId: row.userId as UserId,
        name: row.name,
        characterIds: row.slots.map(slot => slot.characterId as CatalogId),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
