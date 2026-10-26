import { GameOverDTO, GameStateDTO, GameStateUpdatePayload, PresenceChangedDTO, ResolveStepDTO } from './GameState.dto';
import { RoomDTO } from './Room.dto';

export type RoundResolvedDTO = {
    gameState: GameStateDTO;
    resolveLog: ResolveStepDTO[];
};

export type ErrorPayload = { message: string };

export type SessionStartedDTO = { sessionId: string };

export type SessionEvictedDTO = { reason: 'signed-in-elsewhere' };

/**
 * Every event the server sends to clients, with its payload. The single list of the outbound
 * protocol: `WebSocketPort` is typed against it and `protocol/protocol.schema.json` is generated from it.
 */
export type ServerEvents = {
    roomCreated: RoomDTO;
    roomUpdated: RoomDTO;
    gameStateUpdated: GameStateUpdatePayload;
    roundResolved: RoundResolvedDTO;
    gameOver: GameOverDTO;
    presenceChanged: PresenceChangedDTO;
    sessionStarted: SessionStartedDTO;
    sessionEvicted: SessionEvictedDTO;
    error: ErrorPayload;
};
