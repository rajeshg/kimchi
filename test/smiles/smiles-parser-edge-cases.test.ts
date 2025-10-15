import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';

describe('OpenSMILES Edge Cases', () => {
  it('handles 3-digit isotopes', () => {
    const result = parseSMILES('[123C]');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!.atoms[0]!.isotope).toBe(123);
  });

  it('handles large positive charge up to +15', () => {
    const result = parseSMILES('[N+15]');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!.atoms[0]!.charge).toBe(15);
  });

  it('handles large negative charge up to -15', () => {
    const result = parseSMILES('[O-15]');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!.atoms[0]!.charge).toBe(-15);
  });

  it('handles wildcard with isotope and atom class', () => {
    const result = parseSMILES('[2*:7]');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!.atoms[0]!.symbol).toBe('*');
    expect(result.molecules[0]!.atoms[0]!.isotope).toBe(2);
    expect(result.molecules[0]!.atoms[0]!.atomClass).toBe(7);
  });

  it('handles explicit hydrogen H0 and H+', () => {
    const r1 = parseSMILES('[H0]');
    expect(r1.errors).toHaveLength(0);
    expect(r1.molecules[0]!.atoms[0]!.symbol).toBe('H');
    expect(r1.molecules[0]!.atoms[0]!.hydrogens).toBe(0);

    const r2 = parseSMILES('[H+]');
    expect(r2.errors).toHaveLength(0);
    expect(r2.molecules[0]!.atoms[0]!.symbol).toBe('H');
    expect(r2.molecules[0]!.atoms[0]!.charge).toBe(1);
  });

  it('handles two-digit ring numbers with percent and leading zeros', () => {
    const result = parseSMILES('C%01CCCCC%01');
    expect(result.errors).toHaveLength(0);
    expect(result.molecules[0]!.bonds).toHaveLength(6);
  });
});
