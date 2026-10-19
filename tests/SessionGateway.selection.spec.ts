import { SessionGateway } from '@infrastructure/adapters/websocket/session.gateway';
import { SharedWebSocketService } from '@infrastructure/adapters/websocket/services/SharedWebSocketService';
import { SessionCoordinatorService } from '@application/services/SessionCoordinator.service';
import { RoomCoordinatorService } from '@application/services/RoomCoordinator.service';
import { GameCoordinatorService } from '@application/services/GameCoordinator.service';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';

const room = { selectDeck: jest.fn().mockResolvedValue(undefined) };
const game = { confirmSelection: jest.fn(), cancelSelection: jest.fn(), rearrangeTeam: jest.fn() };
const client = { id: 'socket-1' } as Socket;

const gateway = new SessionGateway(
    {} as SharedWebSocketService,
    {} as SessionCoordinatorService,
    room as unknown as RoomCoordinatorService,
    game as unknown as GameCoordinatorService,
    {} as JwtService,
);

beforeEach(() => jest.clearAllMocks());

describe('SessionGateway — match entry events', () => {
    it('selectDeck forwards the deck id and waits for the lookup', async () => {
        await gateway.handleSelectDeck(client, { deckId: 'deck-1' });
        expect(room.selectDeck).toHaveBeenCalledWith('socket-1', 'deck-1');
    });

    it('confirmSelection forwards the picked catalog ids', () => {
        gateway.handleConfirmSelection(client, { characterIds: ['a', 'b', 'c', 'd'] });
        expect(game.confirmSelection).toHaveBeenCalledWith('socket-1', ['a', 'b', 'c', 'd']);
    });

    it('cancelSelection forwards the socket', () => {
        gateway.handleCancelSelection(client);
        expect(game.cancelSelection).toHaveBeenCalledWith('socket-1');
    });

    it('rearrangeTeam forwards the board layout, empty cell included', () => {
        gateway.handleRearrangeTeam(client, { slots: ['a', null, 'b', 'c', 'd'] });
        expect(game.rearrangeTeam).toHaveBeenCalledWith('socket-1', ['a', null, 'b', 'c', 'd']);
    });
});
