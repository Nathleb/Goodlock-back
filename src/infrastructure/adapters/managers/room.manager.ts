import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { RoomPort } from '@application/ports/RoomPort';
import { Room } from '@domain/types/Room.type';
import GameState from '@domain/types/GameState.type';
import { createRoom, addPlayerToRoom, removePlayerFromRoom, startRoom, setPresenceInRoom } from '@domain/services/Room.service';

const SWEEP_INTERVAL_MS = 60_000;
const ABANDONED_ROOM_TTL_MS = 10 * 60_000;

@Injectable()
export class RoomManager implements RoomPort, OnModuleInit, OnModuleDestroy {
    private readonly rooms = new Map<string, Room>();
    private readonly playerToRoom = new Map<string, string>();
    private sweepInterval?: ReturnType<typeof setInterval>;

    onModuleInit(): void {
        this.sweepInterval = setInterval(
            () => this.sweepAbandonedRooms(Date.now(), ABANDONED_ROOM_TTL_MS),
            SWEEP_INTERVAL_MS,
        );
        this.sweepInterval.unref?.();
    }

    onModuleDestroy(): void {
        if (this.sweepInterval) clearInterval(this.sweepInterval);
    }

    createRoom(ownerId: string): Room {
        const room = createRoom(ownerId);
        this.rooms.set(room.roomId, room);
        this.playerToRoom.set(ownerId, room.roomId);
        return room;
    }

    joinRoom(playerId: string, roomId: string): Room {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error('Room not found');
        const updated = addPlayerToRoom(room, playerId);
        this.rooms.set(roomId, updated);
        this.playerToRoom.set(playerId, roomId);
        return updated;
    }

    quitRoom(playerId: string): Room | null {
        const roomId = this.playerToRoom.get(playerId);
        if (!roomId) return null;
        const room = this.rooms.get(roomId);
        if (!room) return null;
        const updated = removePlayerFromRoom(room, playerId);
        this.playerToRoom.delete(playerId);
        if (updated === null) {
            this.rooms.delete(roomId);
        } else {
            this.rooms.set(roomId, updated);
        }
        return updated;
    }

    getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }

    startGame(roomId: string, gameState: GameState): Room {
        const room = this.rooms.get(roomId);
        if (!room) throw new Error('Room not found');
        const started = { ...startRoom(room, gameState), phaseStartedAt: Date.now() };
        this.rooms.set(roomId, started);
        return started;
    }

    updateGameState(roomId: string, gameState: GameState): void {
        const room = this.rooms.get(roomId);
        if (!room || !room.isStarted) return;
        // A new confirmation sub-round starts on phase change OR on a KEEP reroll (rollsLeft change).
        const isNewSubRound =
            room.gameState?.phase !== gameState.phase || room.gameState?.rollsLeft !== gameState.rollsLeft;
        const phaseStartedAt = isNewSubRound ? Date.now() : room.phaseStartedAt;
        this.rooms.set(roomId, { ...room, gameState, phaseStartedAt });
    }

    setPresence(roomId: string, playerIndex: number, connected: boolean, now: number): Room | undefined {
        const room = this.rooms.get(roomId);
        if (!room) return undefined;
        const updated = setPresenceInRoom(room, playerIndex, connected, now);
        this.rooms.set(roomId, updated);
        return updated;
    }

    // A player who quits a started game is marked disconnected by the concession flow
    // (RoomCoordinator), so quit rooms still satisfy the "all players disconnected" rule here.
    sweepAbandonedRooms(now: number, thresholdMs: number): string[] {
        const deletedRoomIds: string[] = [];
        for (const room of this.rooms.values()) {
            if (!room.presence) continue;
            const allAbandoned = room.presence.every(
                p => !p.connected && p.disconnectedAt !== null && now - p.disconnectedAt >= thresholdMs,
            );
            if (allAbandoned) deletedRoomIds.push(room.roomId);
        }
        for (const roomId of deletedRoomIds) {
            this.rooms.delete(roomId);
            for (const [playerId, mappedRoomId] of this.playerToRoom.entries()) {
                if (mappedRoomId === roomId) this.playerToRoom.delete(playerId);
            }
        }
        return deletedRoomIds;
    }

    listOpenRooms(): Room[] {
        return [...this.rooms.values()].filter(room => !room.isStarted);
    }
}
