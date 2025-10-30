import { describe, expect, it } from 'bun:test';
import { isOrganicAtom, createAtom } from 'src/utils/atom-utils';

describe('Atom utils', () => {
  it('isOrganicAtom recognizes common organic atoms (case-insensitive)', () => {
    expect(isOrganicAtom('C')).toBe(true);
    expect(isOrganicAtom('c')).toBe(true);
    expect(isOrganicAtom('N')).toBe(true);
    expect(isOrganicAtom('f')).toBe(true);
    expect(isOrganicAtom('I')).toBe(true);
  });

  it('isOrganicAtom rejects non-organic characters and multi-letter symbols', () => {
    expect(isOrganicAtom('H')).toBe(false);
    expect(isOrganicAtom('X')).toBe(false);
    expect(isOrganicAtom('Cl')).toBe(false);
  });

  it('createAtom normalizes symbol and assigns atomicNumber', () => {
    const a = createAtom('cl', 1);
    expect(a!.symbol).toBe('Cl');
    expect(typeof a!.atomicNumber).toBe('number');
    expect(a!.id).toBe(1);
    expect(a!.aromatic).toBe(false);
  });

  it('createAtom respects aromatic and bracket flags', () => {
    const a = createAtom('c', 2, true, true, 7);
    expect(a!.symbol).toBe('C');
    expect(a!.aromatic).toBe(true);
    expect(a!.isBracket).toBe(true);
    expect(a!.atomClass).toBe(7);
  });

  it('createAtom returns null on unknown symbol', () => {
    expect(createAtom('Xx', 5)).toBeNull();
  });
});
