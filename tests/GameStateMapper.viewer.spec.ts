import { GameStateMapper } from '@application/mappers/GameStateMapper';
import GameState from '@domain/types/GameState.type';
import GamePhase from '@domain/types/GamePhase.type';
import Character from '@domain/types/Character.type';
import { Player } from '@domain/types/Player.type';
import { SlotIndex, PlayerIndex } from '@domain/types/Position.type';
import TargetConstraint from '@domain/types/TargetConstraint.type';
import DieFace from '@domain/types/DieFace.type';

const FACE: DieFace = { description: 'd', priority: 1, effects: [], targetConstraint: TargetConstraint.ANY };

function char(id: string, playerIndex: PlayerIndex, slot: number, locked: boolean): Character {
    return {
        id, name: id, maxHp: 10, baseSpeed: 1, hp: 10, shield: 0, modifiers: [],
        baseDie: [FACE, FACE, FACE, FACE, FACE, FACE], face: FACE, isFaceLocked: locked,
        target: { playerIndex: 0, slot: 0 as SlotIndex },
        position: { playerIndex, slot: slot as SlotIndex },
    };
}

function gs(phase: GamePhase, playersReady: [boolean, boolean]): GameState {
    const team = (pi: PlayerIndex): Player => ({
        playerIndex: pi,
        team: [char(`c${pi}0`, pi, 0, true), char(`c${pi}1`, pi, 1, false)],
    });
    return { phase, currentRound: 1, rollsLeft: 1, playersReady, priorityQueue: [], players: [team(0), team(1)] };
}

describe('toDTOForViewer', () => {
    it('always nulls the opponent targets, keeps own targets', () => {
        const dto = GameStateMapper.toDTOForViewer(gs(GamePhase.ASSIGN, [false, true]), 0);
        expect(dto.players[1].team.every(c => c.target === null)).toBe(true);
        expect(dto.players[0].team.every(c => c.target !== null)).toBe(true);
    });

    it('masks opponent locks during KEEP when the opponent already confirmed', () => {
        const dto = GameStateMapper.toDTOForViewer(gs(GamePhase.KEEP, [false, true]), 0);
        expect(dto.players[1].team.every(c => c.isFaceLocked === false)).toBe(true);
    });

    it('keeps opponent locks during KEEP when the opponent has not confirmed', () => {
        const dto = GameStateMapper.toDTOForViewer(gs(GamePhase.KEEP, [false, false]), 0);
        expect(dto.players[1].team[0].isFaceLocked).toBe(true);
    });

    it('delegates to placement masking during PLACEMENT', () => {
        const viewer = GameStateMapper.toDTOForViewer(gs(GamePhase.PLACEMENT, [false, false]), 0);
        const placement = GameStateMapper.toDTOForPlacement(gs(GamePhase.PLACEMENT, [false, false]), 0);
        expect(viewer.players[1].team.map(c => c.position.slot))
            .toEqual(placement.players[1].team.map(c => c.position.slot));
    });

    it('masks player 0 when the viewer is player 1', () => {
        const dto = GameStateMapper.toDTOForViewer(gs(GamePhase.ASSIGN, [true, false]), 1);
        expect(dto.players[0].team.every(c => c.target === null)).toBe(true);
        expect(dto.players[1].team.every(c => c.target !== null)).toBe(true);
    });
});
