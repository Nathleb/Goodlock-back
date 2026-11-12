import { GameOverDTO, GameStateDTO, PresenceChangedDTO, ResolveStepDTO } from './GameState.dto';
import { ErrorPayload } from './Error.dto';
import { RoomDTO } from './Room.dto';

export type RoundResolvedDTO = {
    gameState: GameStateDTO;
    resolveLog: ResolveStepDTO[];
};

export type SessionStartedDTO = { sessionId: string };

export type SessionEvictedDTO = { reason: 'signed-in-elsewhere' };

/**
 * Every event the server sends to clients, with its payload. The single list of the outbound
 * protocol: `WebSocketPort` is typed against it and `protocol/protocol.schema.json` is generated from it.
 */
export type ServerEvents = {
    roomCreated: RoomDTO;
    roomUpdated: RoomDTO;
    gameStateUpdated: GameStateDTO;
    roundResolved: RoundResolvedDTO;
    gameOver: GameOverDTO;
    presenceChanged: PresenceChangedDTO;
    sessionStarted: SessionStartedDTO;
    sessionEvicted: SessionEvictedDTO;
    error: ErrorPayload;
};
