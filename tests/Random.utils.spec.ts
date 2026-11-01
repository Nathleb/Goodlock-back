import { roll1D, roll1D6 } from '@domain/utils/Random.utils';

afterEach(() => jest.restoreAllMocks());

describe('roll1D', () => {
    it.each([
        [0, 0],
        [0.5, 3],
        [0.999, 5],
    ])('maps Math.random() = %p to face index %p on a d6', (random, index) => {
        jest.spyOn(Math, 'random').mockReturnValue(random);
        expect(roll1D6()).toBe(index);
    });

    it('draws within the size it is given', () => {
        jest.spyOn(Math, 'random').mockReturnValue(0.999);
        expect(roll1D(2)).toBe(1);
    });
});
