import { WebSocketGateway, SubscribeMessage, WebSocketServer } from "@nestjs/websockets";
import { Server, Socket } from 'socket.io';
import { RoomService } from "src/server/websocket/services/room.service";
import { SessionService } from "src/server/websocket/services/session.service";
import { DEFAULT } from "src/server/websocket/constants/Default.constants";
import { Session } from "src/server/websocket/Session.type";

@WebSocketGateway(3002, { cors: true })
export class GameGateway {
    @WebSocketServer()
    server: Server;

    constructor(
        private roomService: RoomService,
        private sessionService: SessionService
    ) { }

    afterInit() {
        this.roomService.setServer(this.server);
    }

    handleConnection(client: Socket) {
        this.getSessionInfos(client);
    }

    handleDisconnect(client: Socket) {
        const session = this.sessionService.getSession(client.id);
        if (session && session.inRoomId !== DEFAULT.NO_ROOM) {
            session.isConnected = false;
            const room = this.roomService.getRoom(session.inRoomId);
            if (room) {
                this.server.in(session.inRoomId).emit("joinRoom", room);
            }
        }
    }

    @SubscribeMessage('getSessionInfos')
    getSessionInfos(client: Socket): void {
        const deviceIdentifier = client.handshake.query.deviceIdentifier;
        if (typeof deviceIdentifier === 'string') {
            const session: Session = this.sessionService.reconnectSessionByDeviceIdentifier(client.id, deviceIdentifier) || this.sessionService.createSession(client.id, deviceIdentifier);

            client.emit("getSessionInfos", { pseudo: session.pseudo, inRoomId: session.inRoomId });
        }
    }

    /**
     * Create a new room owned by the client, the rooms parameters are passed as Json in the payload
     * @param client 
     * @param payload 
     * @returns the newly created room
     */
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

    /**
       * Let the client join an existing room, the roomId is provided in the payload
       * TODO payload validation
       * @param client 
       * @param payload 
       * @returns the updated Room
       */
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

    /**
      * Let the client quit the room he is into, the roomId is provided in the payload
      * TODO payload validation
      * @param client 
      * @param payload 
      * @returns the updated Room
      */
    @SubscribeMessage('quitRoom')
    quitRoom(client: Socket): void {
        const session = this.sessionService.getSession(client.id);
        if (!session) throw new Error("session not found");
        this.roomService.quitRoom(session);
        client.emit("getSessionInfos", { pseudo: session.pseudo, inRoomId: session.inRoomId });
    }

    @SubscribeMessage('updatePseudo')
    updatePseudo(client: Socket, payload: string): void {
        const session = this.sessionService.getSession(client.id);
        const { pseudo } = JSON.parse(payload);
        if (!session) throw new Error("session not found");

        session.pseudo = pseudo;
        this.sessionService.updateSession(session);

        const room = this.roomService.getRoom(session.inRoomId);
        this.roomService.updateRoom(room);

        client.emit("getSessionInfos", { pseudo: session.pseudo, inRoomId: session.inRoomId });
    }
}