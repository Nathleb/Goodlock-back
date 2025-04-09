import { Inject } from '@nestjs/common';
import { WebSocketGateway, SubscribeMessage, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ROOM_PORT, SESSION_PORT } from '@application/ports/tokens';
import { SessionPort } from '@application/ports/SessionPort';
import { DEFAULT } from './constants/Default.constants';
import { Session } from '@domain/types/Session.type';
import { RoomPort } from '@application/ports/RoomPort';

@WebSocketGateway(3002, { cors: true })
export class GameGateway {
    @WebSocketServer()
    server: Server;

    constructor(
        @Inject(ROOM_PORT) private roomService: RoomPort,
        @Inject(SESSION_PORT) private sessionService: SessionPort
    ) { }

    handleConnection(client: Socket) {
        this.getSessionInfos(client);
    }

    handleDisconnect(client: Socket) {
        const session = this.sessionService.getSession(client.id);
        if (session && session.inRoomId !== DEFAULT.NO_ROOM) {
            session.isConnected = false;
            this.roomService.quitRoom(session);
        }
    }

    @SubscribeMessage('getSessionInfos')
    getSessionInfos(client: Socket): void {
        const deviceIdentifier = client.handshake.query.deviceIdentifier;
        if (typeof deviceIdentifier === 'string') {
            const session: Session = this.sessionService.reconnectSessionByDeviceIdentifier(client.id, deviceIdentifier)

            client.emit("getSessionInfos", { pseudo: session.pseudo, inRoomId: session.inRoomId });
        }
    }

    @SubscribeMessage('createRoom')
    createRoom(client: Socket): void {
        try {
            const session = this.sessionService.getSession(client.id);
            if (!session) throw new Error("Session not found");
            this.roomService.createRoom(session);
        } catch (error) {
            client.emit("error", `Error while creating room: ${error.message}`);
        }
    }

    @SubscribeMessage('joinRoom')
    joinRoom(client: Socket, payload: string): void {
        try {
            const { roomId } = JSON.parse(payload);
            const session = this.sessionService.getSession(client.id);
            if (!session) throw new Error("Session not found");
            this.roomService.joinRoom(session, roomId);
        } catch (error) {
            client.emit("error", `Error while joining room: ${error}`);
        }
    }

    @SubscribeMessage('quitRoom')
    quitRoom(client: Socket): void {
        const session = this.sessionService.getSession(client.id);
        if (!session) throw new Error("Session not found");
        this.roomService.quitRoom(session);
        client.emit("getSessionInfos", { pseudo: session.pseudo, inRoomId: session.inRoomId });
    }
}