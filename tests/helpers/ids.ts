import { CharacterId, RoomId, SessionId } from '@shared/branded.types';

export const P0 = 'p0' as SessionId;
export const P1 = 'p1' as SessionId;
export const P2 = 'p2' as SessionId;
export const asSession = (id: string): SessionId => id as SessionId;
export const asRoom = (id: string): RoomId => id as RoomId;
export const asCharacter = (id: string): CharacterId => id as CharacterId;
