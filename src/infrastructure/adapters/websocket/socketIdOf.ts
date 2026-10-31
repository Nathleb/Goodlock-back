import { Socket } from 'socket.io';
import { SocketId } from '@shared/branded.types';

/** The one place a socket.io id becomes a SocketId. */
export function socketIdOf(client: Socket): SocketId {
    return client.id as SocketId;
}
