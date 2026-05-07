export type SessionId  = string & { readonly __brand: 'SessionId' };
export type SocketId   = string & { readonly __brand: 'SocketId' };
export type RoomId     = string & { readonly __brand: 'RoomId' };
export type PlayerId   = string & { readonly __brand: 'PlayerId' };
export type CharacterId = string & { readonly __brand: 'CharacterId' };
export type DeviceId   = string & { readonly __brand: 'DeviceId' };

export const asSessionId   = (id: string): SessionId   => id as SessionId;
export const asSocketId    = (id: string): SocketId    => id as SocketId;
export const asRoomId      = (id: string): RoomId      => id as RoomId;
export const asPlayerId    = (id: string): PlayerId    => id as PlayerId;
export const asCharacterId = (id: string): CharacterId => id as CharacterId;
export const asDeviceId    = (id: string): DeviceId    => id as DeviceId;
