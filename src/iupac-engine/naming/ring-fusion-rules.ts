import type { Molecule } from 'types';
import { isRingAromatic } from './iupac-rings/aromatic-naming';

/**
 * Represents a fused ring system
 */
export interface FusedRingSystem {
  rings: number[][];
  fusionAtoms: number[];
  fusionBonds: number[];
  componentRings: number[];
  fusionType: 'linear' | 'angular' | 'peri';
}

/**
 * Identify fused ring systems in a molecule
 * Groups rings that share atoms or bonds into fused systems
 * Also handles cases where SSSR doesn't capture all rings in polycyclic systems
 */
export function identifyFusedRingSystems(
  rings: number[][],
  molecule: Molecule
): FusedRingSystem[] {
  if (rings.length <= 1) return [];

  const fusedSystems: FusedRingSystem[] = [];
  const processedRings = new Set<number>();

  for (let i = 0; i < rings.length; i++) {
    if (processedRings.has(i)) continue;

    const currentRing = rings[i]!;
    const fusedSystem = buildFusedSystem(i, rings, molecule, processedRings);

    if (fusedSystem.rings.length > 1) {
      fusedSystems.push(fusedSystem);

      // Mark all rings in this system as processed
      for (const ringIdx of fusedSystem.componentRings) {
        processedRings.add(ringIdx);
      }
    }
  }

   // Special handling for phenanthrene-like systems where SSSR misses the third ring
   if (fusedSystems.length === 1 && fusedSystems[0]!.rings.length === 2) {
     const system = fusedSystems[0]!;
     if (system.rings.every(ring => ring.length === 6)) {
       // Check if this could be phenanthrene (3 fused 6-membered rings)
       const allAtoms = new Set(system.rings.flat());
       if (allAtoms.size === 10) { // Phenanthrene has 10 unique atoms
         // Check if the shared atoms are consecutive in the ring (naphthalene) or not (phenanthrene)
         const sharedAtoms = Array.from(system.fusionAtoms);
         const ring1 = system.rings[0]!;
         const ring2 = system.rings[1]!;
         const isConsecutiveInRing1 = areConsecutiveInRing(sharedAtoms, ring1);
         const isConsecutiveInRing2 = areConsecutiveInRing(sharedAtoms, ring2);

         if (!isConsecutiveInRing1 && !isConsecutiveInRing2) {
           // This is likely phenanthrene - add the third ring
           const thirdRing = Array.from(allAtoms).sort((a, b) => a - b);
           system.rings.push(thirdRing);
           system.fusionType = 'angular';
         }
       }
     }
   }

  return fusedSystems;
}

/**
 * Build a fused ring system starting from a seed ring
 */
function buildFusedSystem(
  startRingIdx: number,
  rings: number[][],
  molecule: Molecule,
  processedRings: Set<number>
): FusedRingSystem {
  const systemRings: number[][] = [];
  const systemRingIndices: number[] = [];
  const fusionAtoms = new Set<number>();
  const fusionBonds = new Set<number>();

  const toProcess = [startRingIdx];
  const visited = new Set<number>();

  while (toProcess.length > 0) {
    const ringIdx = toProcess.shift()!;
    if (visited.has(ringIdx)) continue;
    
    visited.add(ringIdx);
    systemRings.push(rings[ringIdx]!);
    systemRingIndices.push(ringIdx);

    // Find rings that fuse with this ring
    for (let j = 0; j < rings.length; j++) {
      if (j === ringIdx || visited.has(j) || processedRings.has(j)) continue;

      const sharedAtoms = findSharedAtoms(rings[ringIdx]!, rings[j]!);
      if (sharedAtoms.length > 0) {
        toProcess.push(j);
        
        // Add shared atoms to fusion atoms
        sharedAtoms.forEach(atom => fusionAtoms.add(atom));
        
        // Find fusion bonds between shared atoms
        const sharedBonds = findFusionBonds(new Set(sharedAtoms), molecule);
        sharedBonds.forEach(bond => fusionBonds.add(bond));
      }
    }
  }

  // Determine fusion type
  const fusionType = determineFusionType(systemRings, fusionAtoms);

  return {
    rings: systemRings,
    fusionAtoms: Array.from(fusionAtoms),
    fusionBonds: Array.from(fusionBonds),
    componentRings: systemRingIndices,
    fusionType
  };
}

/**
 * Find atoms shared between two rings
 */
function findSharedAtoms(ring1: number[], ring2: number[]): number[] {
  const set1 = new Set(ring1);
  const set2 = new Set(ring2);
  const shared: number[] = [];

  for (const atom of set1) {
    if (set2.has(atom)) {
      shared.push(atom);
    }
  }

  return shared;
}

/**
 * Find bonds that connect fusion atoms
 */
function findFusionBonds(fusionAtoms: Set<number>, molecule: Molecule): number[] {
  const fusionBondIndices: number[] = [];

  for (let i = 0; i < molecule.bonds.length; i++) {
    const bond = molecule.bonds[i]!;
    if (fusionAtoms.has(bond.atom1) && fusionAtoms.has(bond.atom2)) {
      fusionBondIndices.push(i);
    }
  }

  return fusionBondIndices;
}

/**
 * Check if atoms are consecutive in a ring
 */
function areConsecutiveInRing(atoms: number[], ring: number[]): boolean {
  const ringSet = new Set(ring);
  const atomSet = new Set(atoms.filter(a => ringSet.has(a)));
  if (atomSet.size !== atoms.length) return false;

  // Find positions in ring
  const positions: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    if (atomSet.has(ring[i]!)) {
      positions.push(i);
    }
  }

  if (positions.length !== atoms.length) return false;

  // Check if they are consecutive
  for (let i = 1; i < positions.length; i++) {
    if (positions[i]! - positions[i - 1]! !== 1) {
      return false;
    }
  }

  return true;
}

/**
 * Determine the type of fusion (linear, angular, peri)
 */
function determineFusionType(
  rings: number[][],
  fusionAtoms: Set<number>
): 'linear' | 'angular' | 'peri' {
  if (rings.length === 2) {
    // Two rings fused - check if linear or angular
    const sharedAtoms = Array.from(fusionAtoms);
    if (sharedAtoms.length === 2) {
      // Check if shared atoms are consecutive in the ring
      const isConsecutiveInRing1 = areConsecutiveInRing(sharedAtoms, rings[0]!);
      const isConsecutiveInRing2 = areConsecutiveInRing(sharedAtoms, rings[1]!);

      if (isConsecutiveInRing1 || isConsecutiveInRing2) {
        return 'linear'; // Like naphthalene
      } else {
        return 'angular'; // Like phenanthrene outer rings
      }
    } else {
      // Angular fusion (like phenanthrene has both)
      return 'angular';
    }
  }

   // For 3+ rings, analyze the fusion pattern more carefully
   if (rings.length === 3) {
     // Count how many fusion points each ring has
     const ringFusionCounts = rings.map(ring => {
       let fusionCount = 0;
       for (let i = 0; i < rings.length; i++) {
         if (i === rings.indexOf(ring)) continue;
         const shared = findSharedAtoms(ring, rings[i]!);
         fusionCount += shared.length;
       }
       return fusionCount;
     });

      const shared01 = findSharedAtoms(rings[0]!, rings[1]!).length;
      const shared12 = findSharedAtoms(rings[1]!, rings[2]!).length;
      const shared02 = findSharedAtoms(rings[0]!, rings[2]!).length;

      // Linear fusion (anthracene): middle ring shares 2 atoms with each neighbor, outer rings don't share
      const middleRing = ringFusionCounts[1]!;
      if (middleRing === 4 && shared02 === 0) {
        return 'linear';
      } else {
        // Angular fusion (phenanthrene): outer rings share atoms
        return 'angular';
      }
   }

  return 'angular';
}

/**
 * Identify common fused ring patterns and return their IUPAC names
 */
export function identifyFusedRingPattern(
  fusedSystem: FusedRingSystem,
  molecule: Molecule
): string | null {
  const ringCount = fusedSystem.rings.length;
  const ringSizes = fusedSystem.rings.map(ring => ring.length);
  const rings = fusedSystem.rings;

  // Get all ring atoms
  const allRingAtoms = new Set<number>();
  for (const ring of rings) for (const atomIdx of ring) allRingAtoms.add(atomIdx);
  const ringAtoms = Array.from(allRingAtoms).map(idx => molecule.atoms[idx]).filter((a): a is typeof molecule.atoms[0] => a !== undefined);

  // Sort ring sizes for pattern matching
  const sortedSizes = [...ringSizes].sort((a, b) => a - b);

  // Two fused 6-membered rings -> naphthalene (only when aromatic)
  if (ringCount === 2 && sortedSizes[0] === 6 && sortedSizes[1] === 6) {
    // Check if all atoms are carbon and rings are aromatic (naphthalene)
    const allCarbon = checkAllCarbonInRings(fusedSystem.rings, molecule);
    const aromatic = fusedSystem.rings.every(r => isRingAromatic(r, molecule));
    if (allCarbon && aromatic) {
      return 'naphthalene';
    }
  }

  // Three 6-membered rings -> distinguish anthracene vs phenanthrene (only when aromatic)
  if (ringCount === 3 && sortedSizes.every(size => size === 6)) {
    const allCarbon = checkAllCarbonInRings(fusedSystem.rings, molecule);
    const aromatic = fusedSystem.rings.every(r => isRingAromatic(r, molecule));
    if (allCarbon && aromatic) {
      // Check fusion pattern to distinguish linear (anthracene) vs angular (phenanthrene)
      const fusionPattern = analyzeFusionPattern(fusedSystem, molecule);
      if (fusionPattern === 'linear') {
        return 'anthracene';
      } else if (fusionPattern === 'angular') {
        return 'phenanthrene';
      } else {
        return 'anthracene'; // Default to anthracene
      }
    }
  }

  // Special case for phenanthrene-like systems (2 SSSR rings + 1 combined)
  if (ringCount === 3 && sortedSizes[0] === 6 && sortedSizes[1] === 6 && sortedSizes[2] === 10) {
    const allCarbon = checkAllCarbonInRings(fusedSystem.rings, molecule);
    if (allCarbon) {
      return 'phenanthrene';
    }
  }

  // Two fused rings with heterocycles
  if (ringCount === 2) {
    const nCount = ringAtoms.filter(a => a.symbol === 'N').length;
    const oCount = ringAtoms.filter(a => a.symbol === 'O').length;
    const sCount = ringAtoms.filter(a => a.symbol === 'S').length;

    if (nCount === 2) return 'imidazopyridine';

    // Check for single heteroatom patterns
    if (nCount === 1 && oCount === 0 && sCount === 0) {
      // Check which ring has the N
      const ringsWithHeteroatoms = rings.map((ring, idx) => {
        const heteroCount = ring.filter(atomIdx => {
          const atom = molecule.atoms[atomIdx];
          return atom && atom.symbol === 'N';
        }).length;
        return { idx, heteroCount };
      });
      const nRings = ringsWithHeteroatoms.filter(r => r.heteroCount > 0);
      if (nRings.length === 1) {
        const nRingIdx = nRings[0]!.idx;
        const nRing = rings[nRingIdx]!;
        if (nRing.length === 5) {
          return 'indole';
        } else if (nRing.length === 6) {
          return 'quinoline';
        }
      } else if (nRings.length === 0) {
        // Handle case where N is in a 4-membered ring (SSSR artifact)
        // Look for systems with [4, 6] rings where one ring has N
        const sortedSizes = [...ringSizes].sort((a, b) => a - b);
        if (sortedSizes[0] === 4 && sortedSizes[1] === 6) {
          // Check if any 4-membered ring contains N
          const fourMemberedRings = rings.filter(r => r.length === 4);
          const hasNInFourRing = fourMemberedRings.some(ring =>
            ring.some(atomIdx => molecule.atoms[atomIdx]?.symbol === 'N')
          );
          if (hasNInFourRing) {
            return 'indole';
          }
        }
      }
    }

    if (oCount === 1 && nCount === 0 && sCount === 0) {
      // Handle benzofuran with [4, 7] rings (SSSR artifact)
      const sortedSizes = [...ringSizes].sort((a, b) => a - b);
      if (sortedSizes[0] === 4 && sortedSizes[1] === 7) {
        return 'benzofuran';
      }
      return 'benzofuran';
    }

    if (sCount === 1 && nCount === 0 && oCount === 0) {
      // Handle benzothiophene with [4, 7] rings (SSSR artifact)
      const sortedSizes = [...ringSizes].sort((a, b) => a - b);
      if (sortedSizes[0] === 4 && sortedSizes[1] === 7) {
        return 'benzothiophene';
      }
      return 'benzothiophene';
    }
  }

  // Single 5-membered heterocycles
  if (ringCount === 1 && sortedSizes[0] === 5) {
    const heteroPattern = analyzeHeteroatomsInFusedSystem(fusedSystem, molecule);

    if (heteroPattern === 'pyrrole') {
      return 'pyrrole';
    }
    if (heteroPattern === 'furan') {
      return 'furan';
    }
    if (heteroPattern === 'thiophene') {
      return 'thiophene';
    }
    if (heteroPattern === 'imidazole') {
      return 'imidazole';
    }
  }

  // Additional patterns for heterocycle identification
  if (ringCount === 1) {
    const ring = fusedSystem.rings[0]!;
    const ringSize = ring.length;
    const ringAtoms = ring.map(idx => molecule.atoms[idx]).filter((atom): atom is typeof molecule.atoms[0] => atom !== undefined);
    const heteroAtoms = ringAtoms.filter(atom => atom.symbol !== 'C');

    // Imidazole (5-membered with 2 nitrogens)
    if (ringSize === 5 && heteroAtoms.length === 2) {
      const nitrogenCount = heteroAtoms.filter(atom => atom.symbol === 'N').length;
      if (nitrogenCount === 2) {
        // Check if one nitrogen has hydrogen (characteristic of imidazole)
        const nitrogensWithH = heteroAtoms.filter(atom =>
          atom.symbol === 'N' && atom.hydrogens && atom.hydrogens > 0
        ).length;
        if (nitrogensWithH === 1) {
          return 'imidazole';
        }
      }
    }

    // Oxazole (5-membered with N and O)
    if (ringSize === 5 && heteroAtoms.length === 2) {
      const hasNitrogen = heteroAtoms.some(atom => atom.symbol === 'N');
      const hasOxygen = heteroAtoms.some(atom => atom.symbol === 'O');
      if (hasNitrogen && hasOxygen) {
        return 'oxazole';
      }
    }

    // Thiazole (5-membered with N and S)
    if (ringSize === 5 && heteroAtoms.length === 2) {
      const hasNitrogen = heteroAtoms.some(atom => atom.symbol === 'N');
      const hasSulfur = heteroAtoms.some(atom => atom.symbol === 'S');
      if (hasNitrogen && hasSulfur) {
        return 'thiazole';
      }
    }
  }

  return null;
}

/**
 * Check if all atoms in rings are carbon
 */
function checkAllCarbonInRings(rings: number[][], molecule: Molecule): boolean {
  for (const ring of rings) {
    for (const atomIdx of ring) {
      const atom = molecule.atoms[atomIdx];
      if (!atom || atom.symbol !== 'C') {
        return false;
      }
    }
  }
  return true;
}

/**
 * Analyze fusion pattern for three-ring systems
 */
function analyzeFusionPattern(
  fusedSystem: FusedRingSystem,
  molecule: Molecule
): 'linear' | 'angular' | null {
  if (fusedSystem.rings.length !== 3) return null;

  // For three rings, check the connectivity pattern
  // Linear: middle ring shares 2 atoms with each neighbor (anthracene)
  // Angular: more complex sharing (phenanthrene)

  const rings = fusedSystem.rings;
  const shared01 = findSharedAtoms(rings[0]!, rings[1]!).length;
  const shared12 = findSharedAtoms(rings[1]!, rings[2]!).length;
  const shared02 = findSharedAtoms(rings[0]!, rings[2]!).length;

  // Linear fusion: each pair shares exactly 2 atoms
  if (shared01 === 2 && shared12 === 2 && shared02 === 0) {
    return 'linear';
  }

  // Angular fusion: outer rings share atoms with middle, but not with each other
  if (shared01 === 2 && shared12 === 2 && shared02 === 0) {
    return 'linear'; // Actually this is still linear
  }

  // For phenanthrene-like: check if it's angular
  // Simplified: if any outer rings share atoms, it's angular
  if (shared02 > 0) {
    return 'angular';
  }

  return 'linear'; // Default
}

/**
 * Analyze heteroatom patterns in fused systems
 */
function analyzeHeteroatomsInFusedSystem(
  fusedSystem: FusedRingSystem,
  molecule: Molecule
): string | null {
  const heteroAtoms: { symbol: string; ringIdx: number; atomIdx: number }[] = [];

  for (let i = 0; i < fusedSystem.rings.length; i++) {
    const ring = fusedSystem.rings[i]!;
    for (const atomIdx of ring) {
      const atom = molecule.atoms[atomIdx];
      if (atom && atom.symbol !== 'C') {
        heteroAtoms.push({ symbol: atom.symbol, ringIdx: i, atomIdx });
      }
    }
  }

  // Pattern matching for common fused heterocycles
  if (heteroAtoms.length === 1) {
    const hetero = heteroAtoms[0]!;
    const ringSize = fusedSystem.rings[hetero.ringIdx]!.length;
    
    // Check if it's a 5-membered heterocycle fused to benzene
    if (ringSize === 5 && fusedSystem.rings.length === 2) {
      const otherRingSize = fusedSystem.rings.find((_, idx) => idx !== hetero.ringIdx)?.length;
      if (otherRingSize === 6) {
        // 5-membered heterocycle fused to benzene
        switch (hetero.symbol) {
          case 'N': 
            // Check if it's pyrrole-like (NH) or pyridine-like (N)
            const atom = molecule.atoms[hetero.atomIdx]!;
            if (atom.hydrogens && atom.hydrogens > 0) {
              return 'pyrrole_fused';
            } else {
              return 'pyridine_fused';
            }
          case 'O': return 'furan_fused';
          case 'S': return 'thiophene_fused';
        }
      }
    }
    
    if (ringSize === 5) {
      return `${hetero.symbol}_in_5`;
    }
  }

  // Enhanced pattern matching for specific fused systems
  if (fusedSystem.rings.length === 2) {
    // Check for fused systems with one all-carbon ring and one heterocycle
    const ringsWithHeteroatoms = fusedSystem.rings.map((ring, idx) => {
      const heteroCount = ring.filter(atomIdx => {
        const atom = molecule.atoms[atomIdx];
        return atom && atom.symbol !== 'C';
      }).length;
      return { idx, heteroCount, size: ring.length };
    });

    const allCarbonRings = ringsWithHeteroatoms.filter(r => r.heteroCount === 0);
    const heteroRings = ringsWithHeteroatoms.filter(r => r.heteroCount > 0);

    if (allCarbonRings.length === 1 && heteroRings.length === 1) {
      const heteroRing = fusedSystem.rings[heteroRings[0]!.idx]!;
      const heteroAtoms = heteroRing
        .map(atomIdx => molecule.atoms[atomIdx])
        .filter((atom): atom is typeof molecule.atoms[0] => atom !== undefined && atom.symbol !== 'C');

      if (heteroAtoms.length === 1) {
        const heteroAtom = heteroAtoms[0]!;

        // Check hydrogen count to distinguish pyrrole vs pyridine type
        if (heteroAtom.symbol === 'N') {
          if (heteroAtom.hydrogens && heteroAtom.hydrogens > 0) {
            return 'pyrrole_fused'; // indole
          } else {
            return 'pyridine_fused'; // quinoline, isoquinoline
          }
        }

        switch (heteroAtom.symbol) {
          case 'O': return 'furan_fused'; // benzofuran
          case 'S': return 'thiophene_fused'; // benzothiophene
        }
      }
    }
  }

  // Check for single 5-membered heterocycles
  if (fusedSystem.rings.length === 1) {
    const ring = fusedSystem.rings[0]!;
    const ringSize = ring.length;
    const ringAtoms = ring.map(idx => molecule.atoms[idx]).filter((atom): atom is typeof molecule.atoms[0] => atom !== undefined);
    const heteroAtoms = ringAtoms.filter(atom => atom.symbol !== 'C');

    if (ringSize === 5 && heteroAtoms.length === 1) {
      const heteroAtom = heteroAtoms[0]!;
      if (heteroAtom.symbol === 'N' && heteroAtom.hydrogens && heteroAtom.hydrogens > 0) {
        return 'pyrrole';
      }
      if (heteroAtom.symbol === 'O') {
        return 'furan';
      }
      if (heteroAtom.symbol === 'S') {
        return 'thiophene';
      }
    }

    if (ringSize === 5 && heteroAtoms.length === 2) {
      const nitrogenCount = heteroAtoms.filter(atom => atom.symbol === 'N').length;
      if (nitrogenCount === 2) {
        return 'imidazole';
      }
    }
  }

  return null;
}