import { NodeMatchTimer } from '@infrastructure/adapters/timers/node-match-timer';
import { asRoom } from './helpers/ids';

const ROOM = asRoom('room-1');
const OTHER = asRoom('room-2');
const NOW = 1_000_000;

beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
});
afterEach(() => jest.useRealTimers());

describe('CLOCK-3, AWAY-3: the timer that ends a match when time runs out', () => {
    it('calls back at the moment it was given, not before', () => {
        const timer = new NodeMatchTimer();
        const onExpire = jest.fn();

        timer.schedule(ROOM, NOW + 5000, onExpire);

        jest.advanceTimersByTime(4999);
        expect(onExpire).not.toHaveBeenCalled();
        jest.advanceTimersByTime(1);
        expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('calls back at once for a moment already past', () => {
        const timer = new NodeMatchTimer();
        const onExpire = jest.fn();

        timer.schedule(ROOM, NOW - 10_000, onExpire);

        jest.advanceTimersByTime(0);
        expect(onExpire).toHaveBeenCalledTimes(1);
    });

    it('keeps one timer per room: a new moment replaces the previous one', () => {
        const timer = new NodeMatchTimer();
        const first = jest.fn();
        const second = jest.fn();

        timer.schedule(ROOM, NOW + 1000, first);
        timer.schedule(ROOM, NOW + 2000, second);

        jest.advanceTimersByTime(5000);
        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('keeps the timers of different rooms apart', () => {
        const timer = new NodeMatchTimer();
        const a = jest.fn();
        const b = jest.fn();

        timer.schedule(ROOM, NOW + 1000, a);
        timer.schedule(OTHER, NOW + 1000, b);
        timer.cancel(ROOM);

        jest.advanceTimersByTime(1000);
        expect(a).not.toHaveBeenCalled();
        expect(b).toHaveBeenCalledTimes(1);
    });

    it('cancels, and cancelling a room with no timer does nothing', () => {
        const timer = new NodeMatchTimer();
        const onExpire = jest.fn();
        timer.schedule(ROOM, NOW + 1000, onExpire);

        timer.cancel(ROOM);
        timer.cancel(OTHER);

        jest.advanceTimersByTime(5000);
        expect(onExpire).not.toHaveBeenCalled();
        expect(jest.getTimerCount()).toBe(0);
    });

    it('forgets the timer once it has fired, so the room can be scheduled again', () => {
        const timer = new NodeMatchTimer();
        const onExpire = jest.fn();
        timer.schedule(ROOM, NOW + 1000, onExpire);
        jest.advanceTimersByTime(1000);

        timer.schedule(ROOM, NOW + 3000, onExpire);

        jest.advanceTimersByTime(2000);
        expect(onExpire).toHaveBeenCalledTimes(2);
    });
});
