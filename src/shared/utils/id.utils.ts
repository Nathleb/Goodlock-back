import { randomUUID } from 'crypto';
import {
  SessionId,
  RoomId,
  PlayerId,
  CharacterId,
  asSessionId,
  asRoomId,
  asPlayerId,
  asCharacterId,
} from '../types/branded.types';

/**
 * Generates a new unique SessionId.
 * @returns A new SessionId
 */
export function generateSessionId(): SessionId {
  return asSessionId(randomUUID());
}

/**
 * Generates a new unique RoomId.
 * @returns A new RoomId
 */
export function generateRoomId(): RoomId {
  return asRoomId(randomUUID());
}

/**
 * Generates a new unique PlayerId.
 * @returns A new PlayerId
 */
export function generatePlayerId(): PlayerId {
  return asPlayerId(randomUUID());
}

/**
 * Generates a new unique CharacterId.
 * @returns A new CharacterId
 */
export function generateCharacterId(): CharacterId {
  return asCharacterId(randomUUID());
}

/**
 * Generates a short random string for display purposes.
 * @param length - Number of characters (default: 4)
 * @returns A short random string
 */
export function generateShortId(length: number = 4): string {
  return randomUUID().substring(0, length);
}
