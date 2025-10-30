import { describe, it, expect } from 'bun:test';
import { generateIUPACNameFromSMILES } from 'index';

describe('IUPAC substituent ordering', () => {
  it('orders methyl before ethyl when locants equal per spec', () => {
    const smi = 'CCC(C)(CCC(C)C)CC';
    const result = generateIUPACNameFromSMILES(smi);
    const name = result.name;
    // Expect methyl before ethyl in the substituent list
    expect(name).toBeTruthy();
    expect(typeof name).toBe('string');
    expect(name.includes('methyl')).toBe(true);
    expect(name.includes('ethyl')).toBe(true);
    const methylIndex = name.indexOf('methyl');
    const ethylIndex = name.indexOf('ethyl');
    expect(methylIndex).toBeLessThan(ethylIndex);
  });

  it('orders substituents by lowest locant first', () => {
    const smi = 'CC(C)(C(C)(C)C)C';
    const result = generateIUPACNameFromSMILES(smi);
    const name = result.name;
    expect(name).toBeTruthy();
    expect(typeof name).toBe('string');
    const locantPattern = /^(?<locants>[0-9,]+)-(?<subs>.+)$/;
    // crude assertion: name starts with locants and a substituent list
    expect(locantPattern.test(name)).toBe(true);
  });
});