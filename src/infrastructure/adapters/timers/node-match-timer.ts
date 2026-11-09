import { Injectable } from '@nestjs/common';
import { MatchTimerPort } from '@application/ports/MatchTimerPort';
import { RoomId } from '@shared/branded.types';

@Injectable()
export class NodeMatchTimer implements MatchTimerPort {
    private readonly timers = new Map<RoomId, ReturnType<typeof setTimeout>>();

    schedule(roomId: RoomId, at: number, onExpire: () => void): void {
        this.cancel(roomId);
        const timer = setTimeout(() => {
            this.timers.delete(roomId);
            onExpire();
        }, Math.max(0, at - Date.now()));
        // A pending match clock must not keep the process alive.
        timer.unref?.();
        this.timers.set(roomId, timer);
    }

    cancel(roomId: RoomId): void {
        const timer = this.timers.get(roomId);
        if (timer === undefined) return;
        clearTimeout(timer);
        this.timers.delete(roomId);
    }
}
