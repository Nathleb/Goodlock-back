import { TEST_CATALOG_ID } from './helpers/catalog';
import { enemyRel } from './helpers/targets';
import { createGameState } from './helpers/gameState';
import { unwrap } from './helpers/result';
import { GameStateMapper } from '@application/mappers/GameStateMapper';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import EffectLabel from '@domain/types/EffectLabels.type';
import { SlotIndex } from '@domain/types/Position.type';
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

    it.each([0, 1] as const)('is absent from the PLACEMENT state sent to player %s', (viewer) => {
        expect(GameStateMapper.toDTOForPlacement(inPhase(GamePhase.PLACEMENT), viewer)).not.toHaveProperty('preview');
    });
});
