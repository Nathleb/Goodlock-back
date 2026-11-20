import { TEST_CATALOG_ID } from './helpers/catalog';
import { enemyRel } from './helpers/targets';
import { createGameState } from './helpers/gameState';
import { unwrap } from './helpers/result';
import { GameStateMapper } from '@application/mappers/GameStateMapper';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import EffectLabel from '@domain/types/EffectLabels.type';
import { SlotIndex } from '@domain/types/Position.type';
import { Player } from '@domain/types/Player.type';
import { BaseDieInstructions } from '@domain/types/BaseDieInstructions.type';
import { createCharacter, generateFullDie } from '@domain/services/CharacterGeneration.service';
import { createPlayer } from '@domain/services/Player.service';
import { previewRound } from '@domain/services/GameLoop.service';

const hit: BaseDieInstructions[number] = { description: 'hit', priority: 1, effects: [{ targets: [enemyRel(0)], parts: [{ part: EffectLabel.Damage, magnitude: 1 }] }] };
const die = generateFullDie([hit, hit, hit, hit, hit, hit]);

const makeTeam = (pi: 0 | 1) =>
    createPlayer([0, 1, 2, 3].map(i => createCharacter({
        catalogId: TEST_CATALOG_ID, name: `c${pi}${i}`, maxHp: 10, baseSpeed: 1, baseDie: die,
        position: { playerIndex: pi, slot: i as SlotIndex },
    })), pi);

const inPhase = (phase: GamePhase): GameState => ({ ...createGameState(makeTeam(0), makeTeam(1)), phase });

describe('the round preview (UX-1 of the match screen spec)', () => {
    it('is sent with a KEEP state: the log the round would give from the current faces', () => {
        const state = inPhase(GamePhase.KEEP);
        const dto = GameStateMapper.toDTO(state);
        expect(dto.preview).toEqual(GameStateMapper.resolveStepsToDTO(unwrap(previewRound(state))));
        expect(dto.preview!.length).toBeGreaterThan(0);
        // Every action is in the same bracket at the same speed: player 0 holds the initiative, so its
        // slot 0 acts first, and its face hits the enemy in front of it.
        const [first] = dto.preview!;
        expect(first.characterId).toBe(state.players[0].team[0].id);
        expect(first.effects[0].targets).toEqual([{ playerIndex: 1, slot: 0 }]);
        expect(first.effects[0].parts).toEqual([EffectLabel.Damage]);
    });

    it('never shows the dice kept in the Keep in progress: each snapshot shows a die as kept at the last Roll', () => {
        // In each team: slot 0 is kept now but was not at the last Roll, slot 1 the other way round.
        // The locks of the current Keep stay with their owner (GAME-9), in every state sent.
        const withLocks = (player: Player): Player => ({
            ...player,
            team: player.team.map(c =>
                c.position.slot === 0 ? { ...c, isFaceLocked: true, keptAtLastRoll: false }
                : c.position.slot === 1 ? { ...c, isFaceLocked: false, keptAtLastRoll: true }
                : c),
        });
        const base = inPhase(GamePhase.KEEP);
        const state: GameState = { ...base, players: [withLocks(base.players[0]), withLocks(base.players[1])] };
        const keptAtLastRoll = new Map(state.players.flatMap(p => p.team).map(c => [c.id as string, c.keptAtLastRoll]));
        const flipped = state.players.flatMap(p => p.team).filter(c => c.position.slot <= 1).map(c => c.id as string);

        for (const dto of [GameStateMapper.toDTO(state), GameStateMapper.toDTOForViewer(state, 0), GameStateMapper.toDTOForViewer(state, 1)]) {
            const changes = dto.preview!.flatMap(step => step.changes);
            expect(changes.map(c => c.characterId)).toEqual(expect.arrayContaining(flipped));
            changes.forEach(c => expect(c.after.isFaceLocked).toBe(keptAtLastRoll.get(c.characterId)));
        }
    });

    it('is the same for both viewers and in the room-wide state', () => {
        const state = { ...inPhase(GamePhase.KEEP), playersReady: [true, false] as [boolean, boolean] };
        const roomWide = GameStateMapper.toDTO(state).preview;
        expect(roomWide).toBeDefined();
        expect(GameStateMapper.toDTOForViewer(state, 0).preview).toEqual(roomWide);
        expect(GameStateMapper.toDTOForViewer(state, 1).preview).toEqual(roomWide);
    });

    it.each([GamePhase.SELECTION, GamePhase.PLACEMENT, GamePhase.ROLL, GamePhase.RESOLVE, GamePhase.RESULT])(
        'is absent outside KEEP (%s)',
        (phase) => {
            const state = inPhase(phase);
            expect(GameStateMapper.toDTO(state)).not.toHaveProperty('preview');
            expect(GameStateMapper.toDTOForViewer(state, 0)).not.toHaveProperty('preview');
            expect(GameStateMapper.toDTOForViewer(state, 1)).not.toHaveProperty('preview');
        },
    );
});
