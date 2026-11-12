import { RoomId } from '@shared/branded.types';

/** Wakes the server up when a clock or a reconnection time of a match runs out (CLOCK-3, AWAY-3). */
export interface MatchTimerPort {
    /** Calls `onExpire` at epoch ms `at`. A room has one timer: a new one replaces the previous one. */
    schedule(roomId: RoomId, at: number, onExpire: () => void): void;
    cancel(roomId: RoomId): void;
}
