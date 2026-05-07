import { Injectable } from '@nestjs/common';
import { SessionPort } from '@application/ports/SessionPort';
import { Session } from '@application/dtos/Session.dto';

@Injectable()
export class SessionManager implements SessionPort {
    private readonly bySockId = new Map<string, Session>();
    private readonly byDeviceId = new Map<string, Session>();

    createOrReconnectSession(socketId: string, deviceIdentifier: string): Session {
        const existing = this.byDeviceId.get(deviceIdentifier);
        if (existing) {
            this.bySockId.delete(existing.socketId);
            const reconnected: Session = { ...existing, socketId };
            this.bySockId.set(socketId, reconnected);
            this.byDeviceId.set(deviceIdentifier, reconnected);
            return reconnected;
        }
        const session: Session = {
            sessionId: crypto.randomUUID(),
            socketId,
            deviceIdentifier,
        };
        this.bySockId.set(socketId, session);
        this.byDeviceId.set(deviceIdentifier, session);
        return session;
    }

    getSession(socketId: string): Session | undefined {
        return this.bySockId.get(socketId);
    }

    setSessionRoom(socketId: string, roomId: string | undefined): void {
        const session = this.bySockId.get(socketId);
        if (!session) return;
        const updated: Session = { ...session, roomId };
        this.bySockId.set(socketId, updated);
        this.byDeviceId.set(session.deviceIdentifier, updated);
    }

    disconnectSession(socketId: string): void {
        const session = this.bySockId.get(socketId);
        if (!session) return;
        this.bySockId.delete(socketId);
        // byDeviceId entry stays for reconnect
    }

    deleteSession(socketId: string): void {
        const session = this.bySockId.get(socketId);
        if (!session) return;
        this.bySockId.delete(socketId);
        this.byDeviceId.delete(session.deviceIdentifier);
    }
}
