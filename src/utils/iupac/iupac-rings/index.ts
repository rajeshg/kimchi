import type { Molecule } from 'types';
import type { Substituent } from '../iupac-types';
import { BondType } from 'types';
import { analyzeRings, classifyRingSystems } from '../../ring-analysis';
import { identifyFusedRingSystems, identifyFusedRingPattern } from '../../ring-fusion-rules';
import { generateAromaticRingName, isRingAromatic } from './aromatic-naming';
import { identifyPolycyclicPattern, identifyAdvancedFusedPattern } from './fused-naming';
import { generateSubstitutedFusedNameWithIUPACNumbering, findSubstituentsOnFusedSystem } from './substituents';
import { getAlkaneBySize, combineCycloWithSuffix } from './utils';

export function generateCyclicName(
  molecule: Molecule,
  ringInfo: ReturnType<typeof analyzeRings>,
  options?: any
): string {
  // Consider rings of size >= 3 as meaningful for IUPAC naming. Small rings (3- and 4-member)
  // should still be named as cycloalkanes (e.g., cyclopropane), so don't filter them out.
  const meaningfulRings = ringInfo.rings.filter(ring => ring.length >= 3);
  if (process.env.VERBOSE) {
    console.log('[VERBOSE] generateCyclicName: total rings=', ringInfo.rings.length, 'meaningfulRings=', meaningfulRings.length);
  }

  if (meaningfulRings.length === 1) {
    const ring = meaningfulRings[0]!;
    const ringSize = ring.length;
    const isAromatic = isRingAromatic(ring, molecule);
    if (process.env.VERBOSE) console.log('[VERBOSE] monocyclic: ringSize=', ringSize, 'isAromatic=', isAromatic);

    if (isAromatic) {
      const aromaticBaseName = generateAromaticRingName(ring, molecule);
      // Check for substituents on aromatic rings as well
      const substituents = findSubstituentsOnMonocyclicRing(ring, molecule);
      if (process.env.VERBOSE) console.log('[VERBOSE] monocyclic aromatic substituents count=', substituents.length, 'base=', aromaticBaseName);
      if (substituents.length > 0) {
        const res = generateMonocyclicSubstitutedName(aromaticBaseName, substituents, ring, molecule);
        if (process.env.VERBOSE) console.log('[VERBOSE] monocyclic aromatic substituted result=', res);
        return normalizeCyclicName(res, meaningfulRings, molecule);
      }
      return normalizeCyclicName(aromaticBaseName, meaningfulRings, molecule);
    }

    // Check for heterocyclic rings first
    const heterocyclicName = getHeterocyclicName(ring, molecule);
    if (process.env.VERBOSE) console.log('[VERBOSE] monocyclic heterocyclicName=', heterocyclicName);
    if (heterocyclicName) return heterocyclicName;

    // Get the base cycloalkane/cycloalkene/cycloalkyne name
    const cycloName = getMonocyclicBaseName(ring, molecule);
    if (process.env.VERBOSE) console.log('[VERBOSE] monocyclic base name=', cycloName);

    // Find substituents on this monocyclic ring
    const substituents = findSubstituentsOnMonocyclicRing(ring, molecule);
    if (process.env.VERBOSE) console.log('[VERBOSE] monocyclic substituents count=', substituents.length);
    if (substituents.length > 0) {
      const res = generateMonocyclicSubstitutedName(cycloName, substituents, ring, molecule);
      if (process.env.VERBOSE) console.log('[VERBOSE] monocyclic substituted result=', res);
      return normalizeCyclicName(res, meaningfulRings, molecule);
    }

    return cycloName;
  }

  if (meaningfulRings.length > 1) {
    // Special-case: two isolated aromatic rings connected by a single bond -> biphenyl
    if (meaningfulRings.length === 2) {
      const ringA = meaningfulRings[0]!;
      const ringB = meaningfulRings[1]!;
      try {
        const aromaticA = isRingAromatic(ringA, molecule);
        const aromaticB = isRingAromatic(ringB, molecule);
        if (aromaticA && aromaticB) {
          // Count inter-ring bonds
          let interBonds = 0;
          for (const b of molecule.bonds) {
            const a1InA = ringA.includes(b.atom1);
            const a2InA = ringA.includes(b.atom2);
            const a1InB = ringB.includes(b.atom1);
            const a2InB = ringB.includes(b.atom2);
            if ((a1InA && a2InB) || (a1InB && a2InA)) interBonds++;
          }
          if (interBonds === 1) {
            const possibleFused = { rings: [ringA, ringB] };
            const subs = findSubstituentsOnFusedSystem(possibleFused, molecule);
            if (subs.length > 0) {
              return generateSubstitutedFusedNameWithIUPACNumbering('biphenyl', subs, possibleFused, molecule);
            }
            return 'biphenyl';
          }
        }
      } catch (e) {
        // ignore and fall through to general polycyclic handling
      }
    }
    const ringClassification = classifyRingSystems(molecule.atoms, molecule.bonds);
    if (process.env.VERBOSE) console.log('[VERBOSE] polycyclic: classification=', JSON.stringify(ringClassification));

    if (ringClassification.spiro.length > 0) {
      if (process.env.VERBOSE) console.log('[VERBOSE] generating spiro name');
      return generateSpiroName(ringClassification.spiro, molecule, options);
    }
    if (ringClassification.bridged.length > 0) {
      if (process.env.VERBOSE) console.log('[VERBOSE] generating bridged name');
      return generateBridgedName(ringClassification.bridged, molecule, options);
    }
    if (ringClassification.fused.length > 0) {
      if (process.env.VERBOSE) console.log('[VERBOSE] fused systems detected count=', ringClassification.fused.length);
      const fusedSystems = identifyFusedRingSystems(meaningfulRings, molecule);
      if (process.env.VERBOSE) console.log('[VERBOSE] identified fusedSystems=', fusedSystems.length);
      if (fusedSystems.length > 0) {
        const fusedSystem = fusedSystems[0]!;
        if (process.env.VERBOSE) console.log('[VERBOSE] using fusedSystem with rings=', fusedSystem.rings.map((r:any)=>r.length));
        let fusedName = identifyAdvancedFusedPattern(fusedSystem.rings, molecule);
        if (process.env.VERBOSE) console.log('[VERBOSE] advancedFusedPattern=', fusedName);
        if (!fusedName) fusedName = identifyFusedRingPattern(fusedSystem, molecule);
        if (process.env.VERBOSE) console.log('[VERBOSE] basicFusedPattern=', fusedName);
        if (fusedName) {
          const substituents = findSubstituentsOnFusedSystem(fusedSystem, molecule);
          if (process.env.VERBOSE) console.log('[VERBOSE] fused substituents count=', substituents.length);
          if (substituents.length > 0) {
            const res = generateSubstitutedFusedNameWithIUPACNumbering(fusedName, substituents, fusedSystem, molecule);
            if (process.env.VERBOSE) console.log('[VERBOSE] fused substituted result=', res);
            return normalizeCyclicName(res, meaningfulRings, molecule);
          }
          if (process.env.VERBOSE) console.log('[VERBOSE] fusedName result=', fusedName);
          return normalizeCyclicName(fusedName, meaningfulRings, molecule);
        }
      }
    }

    const polycyclicName = identifyPolycyclicPattern(meaningfulRings, molecule);
    if (process.env.VERBOSE) console.log('[VERBOSE] polycyclicName=', polycyclicName);
    if (polycyclicName) {
      // Attempt to find substituents on this fused ring set and apply numbering
      const possibleFusedSystem = { rings: meaningfulRings };
      const subs = findSubstituentsOnFusedSystem(possibleFusedSystem, molecule);
      if (process.env.VERBOSE) console.log('[VERBOSE] polycyclic substituents count=', subs.length);
      if (subs.length > 0) {
        const res = generateSubstitutedFusedNameWithIUPACNumbering(polycyclicName, subs, possibleFusedSystem, molecule);
        if (process.env.VERBOSE) console.log('[VERBOSE] polycyclic substituted result=', res);
        return normalizeCyclicName(res, meaningfulRings, molecule);
      }
      return normalizeCyclicName(polycyclicName, meaningfulRings, molecule);
    }
    const advancedFusedName = identifyAdvancedFusedPattern(meaningfulRings, molecule);
    if (process.env.VERBOSE) console.log('[VERBOSE] advancedFusedName=', advancedFusedName);
    if (advancedFusedName) return normalizeCyclicName(advancedFusedName, meaningfulRings, molecule);
    if (process.env.VERBOSE) console.log('[VERBOSE] falling back to generic polycyclic name');
    return normalizeCyclicName(`polycyclic_C${molecule.atoms.length}`, meaningfulRings, molecule);
  }

  return '';
}

function generateSpiroName(spiro: any, molecule: Molecule, options?: any): string {
  // Placeholder: real spiro naming is complex
  return `spiro_C${molecule.atoms.length}`;
}

function generateBridgedName(bridged: any, molecule: Molecule, options?: any): string {
  return `bridged_C${molecule.atoms.length}`;
}

function getHeterocyclicName(ring: number[], molecule: Molecule): string | null {
  const ringSize = ring.length;
  const ringAtoms = ring.map(idx => molecule.atoms[idx]).filter((atom): atom is typeof molecule.atoms[0] => atom !== undefined);

  // Count heteroatoms in the ring
  const heteroatomCounts: Record<string, number> = {};
  for (const atom of ringAtoms) {
    if (atom.symbol !== 'C') {
      heteroatomCounts[atom.symbol] = (heteroatomCounts[atom.symbol] || 0) + 1;
    }
  }

  const hasOxygen = heteroatomCounts['O'] || 0;
  const hasNitrogen = heteroatomCounts['N'] || 0;
  const hasSulfur = heteroatomCounts['S'] || 0;

  // Only name simple heterocycles (one heteroatom, saturated)
  const totalHetero = hasOxygen + hasNitrogen + hasSulfur;
  if (totalHetero === 0 || totalHetero > 1) return null;

  // Check if saturated (no double bonds in ring)
  const isSaturated = !ring.some(atomIdx => {
    return molecule.bonds.some(bond => {
      const isInRing = (ring.includes(bond.atom1) && ring.includes(bond.atom2));
      return isInRing && bond.type === BondType.DOUBLE;
    });
  });

  if (!isSaturated) return null;

  // Oxirane (C1CO1)
  if (ringSize === 3 && hasOxygen === 1) {
    return 'oxirane';
  }

  // Azirane (C1CN1)
  if (ringSize === 3 && hasNitrogen === 1) {
    return 'azirane';
  }

  // Oxolane (C1CCCO1) - tetrahydrofuran
  if (ringSize === 5 && hasOxygen === 1) {
    return 'oxolane';
  }

  // Pyrrolidine or azolidine (C1CCNC1)
  if (ringSize === 5 && hasNitrogen === 1) {
    return 'pyrrolidine';
  }

  // Thiolane (C1CCCSC1)
  if (ringSize === 5 && hasSulfur === 1) {
    return 'thiolane';
  }

  // 6-membered heterocycles
  if (ringSize === 6 && hasOxygen === 1) {
    return 'oxane';
  }

  if (ringSize === 6 && hasNitrogen === 1) {
    return 'piperidine';
  }

  if (ringSize === 6 && hasSulfur === 1) {
    return 'thiane';
  }

  return null;
}

function getMonocyclicBaseName(ring: number[], molecule: Molecule): string {
  const ringSize = ring.length;

  // Check for unsaturation in the ring
  let doubleCount = 0;
  let tripleCount = 0;

  for (const atomIdx of ring) {
    for (const bond of molecule.bonds) {
      const isInRing = (ring.includes(bond.atom1) && ring.includes(bond.atom2));
      if (isInRing) {
        if (bond.atom1 === atomIdx || bond.atom2 === atomIdx) {
          if (bond.type === BondType.DOUBLE) doubleCount++;
          else if (bond.type === BondType.TRIPLE) tripleCount++;
        }
      }
    }
  }

  // Divide by 2 since each bond is counted twice
  doubleCount = doubleCount / 2;
  tripleCount = tripleCount / 2;

  // Get the alkane name
  const alkaneFullName = getAlkaneBySize(ringSize);

  if (tripleCount > 0) {
    // cycloalkyne - strip off "ane" and add "yne"
    const alkaneRoot = alkaneFullName.replace(/ane$/, '');
    return `cyclo${alkaneRoot}yne`;
  } else if (doubleCount > 0) {
    // cycloalkene - strip off "ane" and add "ene"
    const alkaneRoot = alkaneFullName.replace(/ane$/, '');
    return `cyclo${alkaneRoot}ene`;
  } else {
    // cycloalkane - keep the full name
    return `cyclo${alkaneFullName}`;
  }
}

function findSubstituentsOnMonocyclicRing(ring: number[], molecule: Molecule): Substituent[] {
   const substituents: Substituent[] = [];
   const ringSet = new Set(ring);

   // Find all atoms bonded to the ring that are not part of the ring
   for (const ringAtomIdx of ring) {
     for (const bond of molecule.bonds) {
       let substituentAtomIdx = -1;
       if (bond.atom1 === ringAtomIdx && !ringSet.has(bond.atom2)) {
         substituentAtomIdx = bond.atom2;
       } else if (bond.atom2 === ringAtomIdx && !ringSet.has(bond.atom1)) {
         substituentAtomIdx = bond.atom1;
       }

       if (substituentAtomIdx >= 0) {
         // Skip OH groups directly attached to ring - these are principal functional groups, not substituents
         const substituentAtom = molecule.atoms[substituentAtomIdx];
         if (substituentAtom?.symbol === 'O' && substituentAtom.hydrogens === 1 && bond.type === BondType.SINGLE) {
           continue;
         }
         
         const substituentInfo = classifySubstituent(molecule, substituentAtomIdx, ringSet);
         if (substituentInfo) {
           // Store the ring atom index as position (will be renumbered later)
           substituents.push({
             position: ringAtomIdx,
             type: substituentInfo.type,
             size: substituentInfo.size,
             name: substituentInfo.name
           } as any);
         }
       }
     }
   }

   // Remove duplicates
   const unique = substituents.filter((s, i, arr) =>
     i === arr.findIndex(x => x.position === s.position && x.name === s.name)
   );
   return unique;
}

function classifySubstituent(molecule: Molecule, startAtomIdx: number, ringAtoms: Set<number>): { type: string; size: number; name: string } | null {
  const visited = new Set<number>(ringAtoms);
  const substituentAtoms = new Set<number>();
  const stack = [startAtomIdx];
  visited.add(startAtomIdx);
  substituentAtoms.add(startAtomIdx);

  while (stack.length > 0) {
    const currentIdx = stack.pop()!;
    substituentAtoms.add(currentIdx);
    for (const bond of molecule.bonds) {
      let neighborIdx = -1;
      if (bond.atom1 === currentIdx && !visited.has(bond.atom2)) {
        neighborIdx = bond.atom2;
      } else if (bond.atom2 === currentIdx && !visited.has(bond.atom1)) {
        neighborIdx = bond.atom1;
      }
      if (neighborIdx >= 0) {
        visited.add(neighborIdx);
        stack.push(neighborIdx);
      }
    }
  }

  const atoms = Array.from(substituentAtoms)
    .map(idx => molecule.atoms[idx])
    .filter((atom): atom is typeof molecule.atoms[0] => atom !== undefined);

  const carbonCount = atoms.filter(atom => atom.symbol === 'C').length;

  // Simple substituents
  if (carbonCount === 1 && atoms.length === 1) {
    return { type: 'alkyl', size: 1, name: 'methyl' };
  } else if (carbonCount === 2 && atoms.length === 2) {
    return { type: 'alkyl', size: 2, name: 'ethyl' };
  } else if (carbonCount === 3 && atoms.length === 3) {
    return { type: 'alkyl', size: 3, name: 'propyl' };
  } else if (atoms.some(atom => atom.symbol === 'O' && atom.hydrogens === 1)) {
    return { type: 'functional', size: 1, name: 'hydroxy' };
  } else if (atoms.some(atom => atom.symbol === 'Cl')) {
    return { type: 'halo', size: 1, name: 'chloro' };
  } else if (atoms.some(atom => atom.symbol === 'Br')) {
    return { type: 'halo', size: 1, name: 'bromo' };
  } else if (atoms.some(atom => atom.symbol === 'I')) {
    return { type: 'halo', size: 1, name: 'iodo' };
  }

  // Larger alkyl groups
  if (carbonCount > 0) {
    const alkaneNames = ['', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec'];
    const prefix = alkaneNames[carbonCount] || `C${carbonCount}`;
    return { type: 'alkyl', size: carbonCount, name: `${prefix}yl` };
  }

  return null;
}

function generateMonocyclicSubstitutedName(cycloName: string, substituents: Substituent[], ring: number[], molecule: Molecule): string {
  if (substituents.length === 0) return cycloName;

  // Group substituents by name
  let grouped: Record<string, number[]> = {};
  for (const sub of substituents) {
    const key = sub.name;
    if (!grouped[key]) grouped[key] = [];
    // Convert position from atom index to ring position
    const ringPos = ring.indexOf(sub.position as unknown as number) + 1;
    if (!grouped[key]!.includes(ringPos)) {
      grouped[key]!.push(ringPos);
    }
  }

  // For multiple substituents, apply the lowest-locants rule
  // Try all possible numbering starts and both directions, pick the one with lowest locants
  if (Object.keys(grouped).some(key => grouped[key]!.length > 0)) {
    let bestGrouped = grouped;
    let bestLocants = getAllLocants(grouped);

    // Try both forward and reverse directions
    const ringLength = ring.length;
    
    // Forward direction: try starting from each position
    for (let startPos = 2; startPos <= ringLength; startPos++) {
      const rotatedGrouped: Record<string, number[]> = {};
      for (const [name, positions] of Object.entries(grouped)) {
        rotatedGrouped[name] = (positions || []).map(pos => {
          let newPos = pos - startPos + 1;
          if (newPos <= 0) newPos += ringLength;
          return newPos;
        });
      }

      const rotatedLocants = getAllLocants(rotatedGrouped);
      if (isLocantSetLower(rotatedLocants, bestLocants)) {
        bestGrouped = rotatedGrouped;
        bestLocants = rotatedLocants;
      }
    }

    // Reverse direction: mirror the ring and try starting from each position
    for (let startPos = 2; startPos <= ringLength; startPos++) {
      const rotatedGrouped: Record<string, number[]> = {};
      for (const [name, positions] of Object.entries(grouped)) {
        rotatedGrouped[name] = (positions || []).map(pos => {
          // In reverse direction: pos becomes (ringLength - pos + 2)
          // Then apply rotation by startPos
          let mirrorPos = ringLength - pos + 2;
          let newPos = mirrorPos - startPos + 1;
          if (newPos <= 0) newPos += ringLength;
          return newPos;
        });
      }

      const rotatedLocants = getAllLocants(rotatedGrouped);
      if (isLocantSetLower(rotatedLocants, bestLocants)) {
        bestGrouped = rotatedGrouped;
        bestLocants = rotatedLocants;
      }
    }

    grouped = bestGrouped;
  }

  // Generate prefixes
  const prefixes: string[] = [];
  for (const [name, positions] of Object.entries(grouped)) {
    const sortedPositions = (positions || []).slice().sort((a, b) => a - b);

    // IUPAC rule: for single substituent, no locant is needed
    if (sortedPositions.length === 1 && Object.keys(grouped).length === 1) {
      prefixes.push(name);
    } else {
      // Multiple substituents or only one of many types: use locants
      const posStr = sortedPositions.join(',');
      let prefix = '';
      if (sortedPositions.length === 1) {
        prefix = `${posStr}-${name}`;
      } else {
        prefix = `${posStr}-${getMultiplicityPrefix(sortedPositions.length)}${name}`;
      }
      prefixes.push(prefix);
    }
  }

  prefixes.sort();
  return `${prefixes.join('-')}${cycloName}`;
}

function getAllLocants(grouped: Record<string, number[]>): number[] {
  const all: number[] = [];
  for (const positions of Object.values(grouped)) {
    if (positions) {
      all.push(...positions);
    }
  }
  return all.sort((a, b) => a - b);
}

function isLocantSetLower(set1: number[], set2: number[]): boolean {
  for (let i = 0; i < Math.min(set1.length, set2.length); i++) {
    if (set1[i]! < set2[i]!) return true;
    if (set1[i]! > set2[i]!) return false;
  }
  return false;
}

function getMultiplicityPrefix(n: number): string {
  const map: Record<number, string> = { 2: 'di', 3: 'tri', 4: 'tetra', 5: 'penta' };
  return map[n] ?? `${n}`;
}

/**
 * Normalize some cyclic naming edge-cases to canonical stems that tests expect.
 * - Convert benzenoic acid style to benzoic acid (benzenoic -> benzoic)
 * - Attempt to detect classic fused aromatics (naphthalene, anthracene, phenanthrene)
 */
function normalizeCyclicName(name: string, meaningfulRings: number[][], molecule: Molecule): string {
  if (!name) return name;

  // Normalize common benzoic endings: "benzenoic acid" -> "benzoic acid"
  // and "benzenoic" -> "benzoic" (conservative)
  const benzenoicRegex = /benzenoic( acid)?/i;
  if (benzenoicRegex.test(name)) {
    name = name.replace(/benzenoic acid/ig, 'benzoic acid');
    name = name.replace(/benzenoic/ig, 'benzoic');
  }

  // If name is a generic polycyclic fallback or placeholder, try to detect classic fused aromatic names
  if (/^polycyclic_C/i.test(name) || /^spiro_C/i.test(name) || /^bridged_C/i.test(name)) {
    try {
      // Quick detection for naphthalene (2 fused aromatic 6-membered rings sharing >=2 atoms)
      if (meaningfulRings.length === 2) {
        const [r1, r2] = meaningfulRings;
        const aromaticA = (r1! || []).every(i => molecule.atoms[i!]?.aromatic);
        const aromaticB = (r2! || []).every(i => molecule.atoms[i!]?.aromatic);
        const shared = (r1! || []).filter(x => (r2! || []).includes(x)).length;
        if (aromaticA && aromaticB && shared >= 2) return 'naphthalene';
      }

      // Quick detection for three-ring linear anthracene vs angular phenanthrene
      if (meaningfulRings.length === 3) {
        const rings = meaningfulRings;
        const aromaticAll = rings.every(r => r.every(i => molecule.atoms[i]?.aromatic));
        if (aromaticAll) {
          // Build adjacency: rings adjacent if they share >=2 atoms
          const edges: [number, number][] = [];
          for (let i = 0; i < rings.length; i++) {
            for (let j = i + 1; j < rings.length; j++) {
              const shared = (rings[i]! || []).filter(x => (rings[j]! || []).includes(x)).length;
              if (shared >= 2) edges.push([i, j]);
            }
          }
          // Linear anthracene: edges are [(0,1),(1,2)] -> degrees [1,2,1]
          if (edges.length === 2) {
            const deg = [0, 0, 0];
            edges.forEach(e => { deg[e[0]]++; deg[e[1]]++; });
            if (deg[0] === 1 && deg[1] === 2 && deg[2] === 1) return 'anthracene';
            // Otherwise assume phenanthrene (angular)
            return 'phenanthrene';
          }
        }
      }
    } catch (e) {
      // ignore and fall through to return original name
    }
  }

  return name;
}
