import { describe, it, expect } from 'bun:test';
import { parseSMILES } from 'index';
import { kekulize } from 'src/utils/kekulize';
import { BondType } from 'types';
import type { Bond } from 'types';

async function getRDKitModule() {
  try {
    const rdkitModule = await import('@rdkit/rdkit').catch(() => null);
    if (!rdkitModule) return null;
    const initRDKitModule = rdkitModule.default;
    return await (initRDKitModule as any)();
  } catch (e) {
    return null;
  }
}

function getKekuleBondCounts(bonds: readonly Bond[]) {
  const single = bonds.filter((b: Bond) => b.type === BondType.SINGLE).length;
  const double = bonds.filter((b: Bond) => b.type === BondType.DOUBLE).length;
  const triple = bonds.filter((b: Bond) => b.type === BondType.TRIPLE).length;
  return { single, double, triple };
}

function getBondCountsFromMolBlock(molblock: string) {
  const lines = molblock.split('\n');
  let single = 0;
  let double = 0;
  let triple = 0;
  let aromatic = 0;
  
  const countsLine = lines[3];
  if (!countsLine) return { single: 0, double: 0, triple: 0, aromatic: 0 };
  
  const atomCount = parseInt(countsLine.substring(0, 3).trim());
  const bondCount = parseInt(countsLine.substring(3, 6).trim());
  
  for (let i = 0; i < bondCount; i++) {
    const bondLine = lines[4 + atomCount + i];
    if (!bondLine) continue;
    
    const bondType = parseInt(bondLine.substring(6, 9).trim());
    if (bondType === 1) single++;
    else if (bondType === 2) double++;
    else if (bondType === 3) triple++;
    else if (bondType === 4) aromatic++;
  }
  
  return { single, double, triple, aromatic };
}

describe('Kekulize RDKit Comparison', () => {
  it('should kekulize benzene consistently with RDKit', async () => {
    const RDKit = await getRDKitModule();
    if (!RDKit) {
      console.log('RDKit not available, skipping');
      return;
    }

    const parseResult = parseSMILES('c1ccccc1');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const kekulized = kekulize(molecule);
    const opencodeCounts = getKekuleBondCounts(kekulized.bonds);
    
    const rdkitMol = RDKit.get_mol('c1ccccc1');
    rdkitMol.set_new_coords();
    const molblock = rdkitMol.get_molblock();
    const rdkitCounts = getBondCountsFromMolBlock(molblock);
    rdkitMol.delete();
    
    console.log('Benzene kekulization:');
    console.log('  Opencode:', opencodeCounts);
    console.log('  RDKit:', rdkitCounts);
    
    expect(opencodeCounts.single).toBe(3);
    expect(opencodeCounts.double).toBe(3);
    expect(rdkitCounts.single).toBe(3);
    expect(rdkitCounts.double).toBe(3);
  });
  
  it('should kekulize pyridine consistently with RDKit', async () => {
    const RDKit = await getRDKitModule();
    if (!RDKit) {
      console.log('RDKit not available, skipping');
      return;
    }

    const parseResult = parseSMILES('c1ccncc1');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const kekulized = kekulize(molecule);
    const opencodeCounts = getKekuleBondCounts(kekulized.bonds);
    
    const rdkitMol = RDKit.get_mol('c1ccncc1');
    rdkitMol.set_new_coords();
    const molblock = rdkitMol.get_molblock();
    const rdkitCounts = getBondCountsFromMolBlock(molblock);
    rdkitMol.delete();
    
    console.log('Pyridine kekulization:');
    console.log('  Opencode:', opencodeCounts);
    console.log('  RDKit:', rdkitCounts);
    
    expect(opencodeCounts.single).toBe(3);
    expect(opencodeCounts.double).toBe(3);
    expect(rdkitCounts.single).toBe(3);
    expect(rdkitCounts.double).toBe(3);
  });
  
  it('should kekulize naphthalene consistently with RDKit', async () => {
    const RDKit = await getRDKitModule();
    if (!RDKit) {
      console.log('RDKit not available, skipping');
      return;
    }

    const parseResult = parseSMILES('c1ccc2ccccc2c1');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const kekulized = kekulize(molecule);
    const opencodeCounts = getKekuleBondCounts(kekulized.bonds);
    
    const rdkitMol = RDKit.get_mol('c1ccc2ccccc2c1');
    rdkitMol.set_new_coords();
    const molblock = rdkitMol.get_molblock();
    const rdkitCounts = getBondCountsFromMolBlock(molblock);
    rdkitMol.delete();
    
    console.log('Naphthalene kekulization:');
    console.log('  Opencode:', opencodeCounts);
    console.log('  RDKit:', rdkitCounts);
    
    expect(opencodeCounts.single).toBe(6);
    expect(opencodeCounts.double).toBe(5);
    expect(rdkitCounts.single).toBe(6);
    expect(rdkitCounts.double).toBe(5);
  });
  
  it('should kekulize furan consistently with RDKit', async () => {
    const RDKit = await getRDKitModule();
    if (!RDKit) {
      console.log('RDKit not available, skipping');
      return;
    }

    const parseResult = parseSMILES('c1ccoc1');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const kekulized = kekulize(molecule);
    const opencodeCounts = getKekuleBondCounts(kekulized.bonds);
    
    const rdkitMol = RDKit.get_mol('c1ccoc1');
    rdkitMol.set_new_coords();
    const molblock = rdkitMol.get_molblock();
    const rdkitCounts = getBondCountsFromMolBlock(molblock);
    rdkitMol.delete();
    
    console.log('Furan kekulization:');
    console.log('  Opencode:', opencodeCounts);
    console.log('  RDKit:', rdkitCounts);
    
    expect(opencodeCounts.single).toBe(3);
    expect(opencodeCounts.double).toBe(2);
    expect(rdkitCounts.single).toBe(3);
    expect(rdkitCounts.double).toBe(2);
  });
  
  it('should kekulize pyrrole consistently with RDKit', async () => {
    const RDKit = await getRDKitModule();
    if (!RDKit) {
      console.log('RDKit not available, skipping');
      return;
    }

    const parseResult = parseSMILES('c1cc[nH]c1');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const kekulized = kekulize(molecule);
    const opencodeCounts = getKekuleBondCounts(kekulized.bonds);
    
    const rdkitMol = RDKit.get_mol('c1cc[nH]c1');
    rdkitMol.set_new_coords();
    const molblock = rdkitMol.get_molblock();
    const rdkitCounts = getBondCountsFromMolBlock(molblock);
    rdkitMol.delete();
    
    console.log('Pyrrole kekulization:');
    console.log('  Opencode:', opencodeCounts);
    console.log('  RDKit:', rdkitCounts);
    
    expect(opencodeCounts.single).toBe(3);
    expect(opencodeCounts.double).toBe(2);
    expect(rdkitCounts.single).toBe(3);
    expect(rdkitCounts.double).toBe(2);
  });
  
  it('should kekulize indole consistently with RDKit', async () => {
    const RDKit = await getRDKitModule();
    if (!RDKit) {
      console.log('RDKit not available, skipping');
      return;
    }

    const parseResult = parseSMILES('c1ccc2[nH]ccc2c1');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const kekulized = kekulize(molecule);
    const opencodeCounts = getKekuleBondCounts(kekulized.bonds);
    
    const rdkitMol = RDKit.get_mol('c1ccc2[nH]ccc2c1');
    rdkitMol.set_new_coords();
    const molblock = rdkitMol.get_molblock();
    const rdkitCounts = getBondCountsFromMolBlock(molblock);
    rdkitMol.delete();
    
    console.log('Indole kekulization:');
    console.log('  Opencode:', opencodeCounts);
    console.log('  RDKit:', rdkitCounts);
    
    expect(opencodeCounts.single).toBe(rdkitCounts.single);
    expect(opencodeCounts.double).toBe(rdkitCounts.double);
  });
  
  it('should kekulize anthracene consistently with RDKit', async () => {
    const RDKit = await getRDKitModule();
    if (!RDKit) {
      console.log('RDKit not available, skipping');
      return;
    }

    const parseResult = parseSMILES('c1ccc2cc3ccccc3cc2c1');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const kekulized = kekulize(molecule);
    const opencodeCounts = getKekuleBondCounts(kekulized.bonds);
    
    const rdkitMol = RDKit.get_mol('c1ccc2cc3ccccc3cc2c1');
    rdkitMol.set_new_coords();
    const molblock = rdkitMol.get_molblock();
    const rdkitCounts = getBondCountsFromMolBlock(molblock);
    rdkitMol.delete();
    
    console.log('Anthracene kekulization:');
    console.log('  Opencode:', opencodeCounts);
    console.log('  RDKit:', rdkitCounts);
    
    expect(opencodeCounts.single).toBe(9);
    expect(opencodeCounts.double).toBe(7);
    expect(rdkitCounts.single).toBe(9);
    expect(rdkitCounts.double).toBe(7);
  });
  
  it('should kekulize phenol consistently with RDKit', async () => {
    const RDKit = await getRDKitModule();
    if (!RDKit) {
      console.log('RDKit not available, skipping');
      return;
    }

    const parseResult = parseSMILES('Oc1ccccc1');
    expect(parseResult.errors).toEqual([]);
    const molecule = parseResult.molecules[0]!;
    
    const kekulized = kekulize(molecule);
    const opencodeCounts = getKekuleBondCounts(kekulized.bonds);
    
    const rdkitMol = RDKit.get_mol('Oc1ccccc1');
    rdkitMol.set_new_coords();
    const molblock = rdkitMol.get_molblock();
    const rdkitCounts = getBondCountsFromMolBlock(molblock);
    rdkitMol.delete();
    
    console.log('Phenol kekulization:');
    console.log('  Opencode:', opencodeCounts);
    console.log('  RDKit:', rdkitCounts);
    
    expect(opencodeCounts.single).toBe(4);
    expect(opencodeCounts.double).toBe(3);
    expect(rdkitCounts.single).toBe(4);
    expect(rdkitCounts.double).toBe(3);
  });
});
