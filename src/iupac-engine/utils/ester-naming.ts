import type { Molecule } from '../../../types';
import { buildRingSubstituentAlkylName } from './ring-substituent-naming';
import { analyzeRings } from 'src/utils/ring-analysis';

/**
 * Build functional class name for ester with ring-based alkyl group
 * Example: CC(C)C1(CC(C(O1)(C)C)C(=O)C)OC(=O)C
 * Expected: (4-acetyl-5,5-dimethyl-2-propan-2-yloxolan-2-yl)acetate
 */
export function buildEsterWithRingAlkylGroup(parentStructure: any, esterGroup: any, molecule: any, functionalGroups: any[]): string {
  // For functional class nomenclature, build: (ring-with-all-substituents-yl)alkanoate
  // Example: (4-acetyl-5,5-dimethyl-2-propan-2-yloxolan-2-yl)acetate
  
  if (process.env.VERBOSE) {
    console.log('[buildEsterWithRingAlkylGroup] functionalGroups:', functionalGroups.map(fg => ({ type: fg.type, isPrincipal: fg.isPrincipal, prefix: fg.prefix })));
  }
  
  // Get all substituents from parent structure
  const parentSubstituents = parentStructure.substituents || [];
  
  // Get functional group substituents (non-ester, as prefixes)
  const fgSubstituents = functionalGroups
    .filter(fg => fg.type !== 'ester' && fg.type !== 'alkoxy' && fg.prefix)
    .map(fg => ({
      type: fg.type,
      name: fg.prefix || fg.type,
      locant: fg.locant || (fg.locants && fg.locants[0]) || 0,
      prefix: fg.prefix
    }));
  
  // Combine all substituents
  const allSubstituents = [...fgSubstituents, ...parentSubstituents];
  
  if (process.env.VERBOSE) {
    console.log('[buildEsterWithRingAlkylGroup] parentSubstituents:', parentSubstituents);
    console.log('[buildEsterWithRingAlkylGroup] fgSubstituents:', fgSubstituents);
    console.log('[buildEsterWithRingAlkylGroup] allSubstituents:', allSubstituents);
  }
  
  // Sort substituents by locant
  allSubstituents.sort((a: any, b: any) => (a.locant || 0) - (b.locant || 0));
  
  // Group identical substituents
  const groupedSubstituents = new Map<string, { locants: number[], name: string }>();
  for (const sub of allSubstituents) {
    const key = sub.name || sub.type;
    if (!groupedSubstituents.has(key)) {
      groupedSubstituents.set(key, { locants: [], name: key });
    }
    groupedSubstituents.get(key)!.locants.push(sub.locant || 0);
  }
  
  // Build substituent parts
  const substituentParts: string[] = [];
  for (const [_, group] of groupedSubstituents) {
    const locantStr = group.locants.join(',');
    const multiplier = group.locants.length > 1 ? getMultiplier(group.locants.length) : '';
    substituentParts.push(`${locantStr}-${multiplier}${group.name}`);
  }
  
  // Get ring name
  const ringName = parentStructure.name || 'ring';
  
  // Functional class: ring name ends with -yl suffix
  const ringBaseName = ringName.replace(/e$/, ''); // oxolane → oxolan
  const alkylGroupName = substituentParts.length > 0
    ? `${substituentParts.join('-')}-${ringBaseName}-yl`
    : `${ringBaseName}-yl`;
  
  // Extract the acyl portion (C=O side) length
  const acylLength = getAcylChainLength(esterGroup, molecule);
  const acylName = getAlkanoateName(acylLength);
  
  if (process.env.VERBOSE) {
    console.log('[buildEsterWithRingAlkylGroup] alkylGroupName:', alkylGroupName);
    console.log('[buildEsterWithRingAlkylGroup] acylLength:', acylLength);
    console.log('[buildEsterWithRingAlkylGroup] acylName:', acylName);
  }
  
  // Functional class format: (alkyl)alkanoate
  return `(${alkylGroupName})${acylName}`;
}

/**
 * Get multiplicity prefix (di, tri, tetra, etc.)
 */
export function getMultiplier(count: number): string {
  const prefixes = ['', '', 'di', 'tri', 'tetra', 'penta', 'hexa', 'hepta', 'octa', 'nona', 'deca'];
  return count < prefixes.length ? (prefixes[count] ?? '') : `${count}-`;
}

/**
 * Get the length of the acyl chain (C=O side of the ester)
 */
export function getAcylChainLength(esterGroup: any, molecule: any): number {
  if (!esterGroup.atoms || esterGroup.atoms.length < 3) return 1;
  
  const carbonylCarbon = esterGroup.atoms[0] as unknown as number;
  const esterOxygen = esterGroup.atoms[2] as unknown as number;
  
  // BFS from carbonyl carbon, avoiding ester oxygen
  const visited = new Set<number>();
  const queue = [carbonylCarbon];
  let carbonCount = 0;
  
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    
    const currentAtom = molecule.atoms[currentId];
    if (currentAtom?.symbol === 'C') {
      carbonCount++;
      
      // Find neighbors
      for (const bond of molecule.bonds) {
        if (bond.atom1 === currentId || bond.atom2 === currentId) {
          const otherId = bond.atom1 === currentId ? bond.atom2 : bond.atom1;
          
          // Don't cross the ester oxygen
          if (otherId === esterOxygen) continue;
          
          const otherAtom = molecule.atoms[otherId];
          if (otherAtom?.symbol === 'C' && !visited.has(otherId)) {
            queue.push(otherId);
          }
        }
      }
    }
  }
  
  return carbonCount;
}

/**
 * Convert carbon chain length to alkanoate name
 */
export function getAlkanoateName(length: number): string {
  const prefixes = ['', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec'];
  if (length < prefixes.length) {
    return `${prefixes[length]}anoate`;
  }
  return `C${length}-alkanoate`;
}

/**
 * Build ester name when ring is on acyl side
 * Example: CC(C)COC(=O)C1CCCC1 → "2-methylpropyl cyclopentanecarboxylate"
 */
export function buildEsterWithRingAcylGroup(parentStructure: any, esterGroup: any, molecule: any, functionalGroups: any[]): string {
  if (process.env.VERBOSE) {
    console.log('[buildEsterWithRingAcylGroup] parentStructure:', parentStructure);
  }
  
  // Get ring name
  const ringName = parentStructure.name || 'ring';
  const isAromatic = parentStructure.ring?.type === 'aromatic';
  
  // For aromatic rings with carboxylate, use special naming
  if (isAromatic && ringName.includes('benzen')) {
    // benzoate for benzene ring
    const acylName = 'benzoate';
    
    // Now find the alkoxy group
    const alkoxyName = getAlkoxyGroupName(esterGroup, molecule);
    
    if (process.env.VERBOSE) {
      console.log('[buildEsterWithRingAcylGroup] aromatic acylName:', acylName);
      console.log('[buildEsterWithRingAcylGroup] alkoxyName:', alkoxyName);
    }
    
    return `${alkoxyName} ${acylName}`;
  }
  
  // For non-aromatic rings: cyclo[ring]carboxylate
  // cyclopentane → cyclopentanecarboxylate
  const ringBaseName = ringName; // keep as-is (e.g., "cyclopentane")
  const acylName = `${ringBaseName}carboxylate`;
  
  // Now find the alkoxy group
  const alkoxyName = getAlkoxyGroupName(esterGroup, molecule);
  
  if (process.env.VERBOSE) {
    console.log('[buildEsterWithRingAcylGroup] ringBaseName:', ringBaseName);
    console.log('[buildEsterWithRingAcylGroup] acylName:', acylName);
    console.log('[buildEsterWithRingAcylGroup] alkoxyName:', alkoxyName);
  }
  
  return `${alkoxyName} ${acylName}`;
}

/**
 * Get the alkoxy group name from an ester
 * Walks from ester oxygen to find the alkoxy chain
 */
export function getAlkoxyGroupName(esterGroup: any, molecule: Molecule): string {
  // Find carbonyl carbon and ester oxygen
  let carbonylCarbonId: number | undefined;
  let esterOxygenId: number | undefined;
  
  if (esterGroup.atoms && esterGroup.atoms.length >= 2) {
    // Find carbonyl carbon
    // Note: esterGroup.atoms can be either atom IDs (numbers) or atom objects
    for (const atomOrId of esterGroup.atoms) {
      const atomId = typeof atomOrId === 'number' ? atomOrId : atomOrId.id;
      const atom = molecule.atoms[atomId];
      if (atom?.symbol === 'C') {
        const hasDoubleBondToO = molecule.bonds.some((bond: any) => 
          bond.type === 'double' &&
          ((bond.atom1 === atomId && molecule.atoms[bond.atom2]?.symbol === 'O') ||
           (bond.atom2 === atomId && molecule.atoms[bond.atom1]?.symbol === 'O'))
        );
        if (hasDoubleBondToO) {
          carbonylCarbonId = atomId;
          break;
        }
      }
    }
    
    // Find ester oxygen
    if (carbonylCarbonId !== undefined) {
      for (const atomOrId of esterGroup.atoms) {
        const atomId = typeof atomOrId === 'number' ? atomOrId : atomOrId.id;
        const atom = molecule.atoms[atomId];
        if (atom?.symbol === 'O') {
          const isSingleBonded = molecule.bonds.some((bond: any) => 
            bond.type === 'single' &&
            ((bond.atom1 === carbonylCarbonId && bond.atom2 === atomId) ||
             (bond.atom2 === carbonylCarbonId && bond.atom1 === atomId))
          );
          if (isSingleBonded) {
            esterOxygenId = atomId;
            break;
          }
        }
      }
    }
  }
  
  if (!esterOxygenId) {
    return 'alkyl';
  }
  
  // Find alkoxy carbon (carbon bonded to ester oxygen, not carbonyl carbon)
  let alkoxyCarbonId: number | undefined;
  for (const bond of molecule.bonds) {
    if (bond.type === 'single') {
      const atom1 = molecule.atoms[bond.atom1];
      const atom2 = molecule.atoms[bond.atom2];
      
      if (bond.atom1 === esterOxygenId && atom2?.symbol === 'C' && bond.atom2 !== carbonylCarbonId) {
        alkoxyCarbonId = bond.atom2;
        break;
      } else if (bond.atom2 === esterOxygenId && atom1?.symbol === 'C' && bond.atom1 !== carbonylCarbonId) {
        alkoxyCarbonId = bond.atom1;
        break;
      }
    }
  }
  
  if (alkoxyCarbonId === undefined || esterOxygenId === undefined) {
    return 'alkyl';
  }
  
  // BFS from alkoxy carbon to find chain length and branches
  const visited = new Set<number>();
  const queue: Array<{id: number, parent: number | null}> = [{id: alkoxyCarbonId, parent: esterOxygenId}];
  const carbonChain: number[] = [];
  const branches = new Map<number, number[]>(); // position -> branch carbon IDs
  const alkoxyCarbonIds = new Set<number>();
  
  if (process.env.VERBOSE) {
    console.log('[getAlkoxyGroupName] Starting BFS from alkoxyCarbonId:', alkoxyCarbonId);
  }
  
  while (queue.length > 0) {
    const {id: currentId, parent: parentId} = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    
    const currentAtom = molecule.atoms[currentId];
    if (currentAtom?.symbol === 'C') {
      carbonChain.push(currentId);
      alkoxyCarbonIds.add(currentId);
      
      if (process.env.VERBOSE) {
        console.log(`[getAlkoxyGroupName] Visiting carbon ${currentId}, chain position ${carbonChain.length}`);
      }
      
      // Find neighbors
      const neighbors: number[] = [];
      for (const bond of molecule.bonds) {
        if (bond.type === 'single') {
          if (bond.atom1 === currentId) {
            const otherId = bond.atom2;
            if (otherId !== parentId && otherId !== esterOxygenId && molecule.atoms[otherId]?.symbol === 'C') {
              neighbors.push(otherId);
            }
          } else if (bond.atom2 === currentId) {
            const otherId = bond.atom1;
            if (otherId !== parentId && otherId !== esterOxygenId && molecule.atoms[otherId]?.symbol === 'C') {
              neighbors.push(otherId);
            }
          }
        }
      }
      
      if (process.env.VERBOSE) {
        console.log(`[getAlkoxyGroupName] Found ${neighbors.length} neighbors:`, neighbors);
      }
      
      // If more than 1 neighbor, we have branching
      if (neighbors.length > 1) {
        // First neighbor is main chain continuation, rest are branches
        const firstNeighbor = neighbors[0];
        if (firstNeighbor !== undefined) {
          queue.push({id: firstNeighbor, parent: currentId});
        }
        for (let i = 1; i < neighbors.length; i++) {
          const branchNeighbor = neighbors[i];
          if (branchNeighbor !== undefined) {
            if (!branches.has(carbonChain.length)) {
              branches.set(carbonChain.length, []);
            }
            branches.get(carbonChain.length)!.push(branchNeighbor);
            
            // IMPORTANT: Also add branch to queue so it gets visited and added to alkoxyCarbonIds
            queue.push({id: branchNeighbor, parent: currentId});
            
            if (process.env.VERBOSE) {
              console.log(`[getAlkoxyGroupName] Recording branch ${branchNeighbor} at chain position ${carbonChain.length}`);
            }
          }
        }
      } else if (neighbors.length === 1) {
        const neighbor = neighbors[0];
        if (neighbor !== undefined) {
          queue.push({id: neighbor, parent: currentId});
        }
      }
    }
  }
  
  // **RING DETECTION INTEGRATION POINT**
  // Check if the alkoxy group contains any rings
  const ringInfo = analyzeRings(molecule);
  const ringsInAlkoxy: number[][] = [];
  
  if (process.env.VERBOSE) {
    console.log('[getAlkoxyGroupName] BFS complete. alkoxyCarbonIds:', Array.from(alkoxyCarbonIds));
    console.log('[getAlkoxyGroupName] Total rings in molecule:', ringInfo.rings.length);
    for (let i = 0; i < ringInfo.rings.length; i++) {
      console.log(`[getAlkoxyGroupName] Ring ${i}:`, ringInfo.rings[i]);
    }
  }
  
  for (const ring of ringInfo.rings) {
    const ringIntersection = ring.filter(atomId => alkoxyCarbonIds.has(atomId));
    if (process.env.VERBOSE) {
      console.log(`[getAlkoxyGroupName] Ring ${ringInfo.rings.indexOf(ring)} intersection:`, ringIntersection, `(length ${ringIntersection.length})`);
    }
    if (ringIntersection.length >= 3) {
      ringsInAlkoxy.push(ring);
    }
  }
  
  if (process.env.VERBOSE) {
    console.log('[getAlkoxyGroupName] ringsInAlkoxy:', ringsInAlkoxy);
  }
  
  // If rings detected, use ring-based naming
  if (ringsInAlkoxy.length > 0) {
    const ringName = buildRingSubstituentAlkylName(alkoxyCarbonId, esterOxygenId, molecule);
    if (ringName) {
      if (process.env.VERBOSE) {
        console.log('[getAlkoxyGroupName] Using ring-based name:', ringName);
      }
      return ringName;
    }
  }
  
  // Fall back to chain-only logic if no rings or ring naming failed
  // Build alkoxy name
  const chainLength = carbonChain.length;
  
  if (branches.size === 0) {
    // Simple alkyl group
    const alkylPrefixes = ['', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec'];
    if (chainLength < alkylPrefixes.length) {
      return `${alkylPrefixes[chainLength]}yl`;
    }
    return `C${chainLength}-alkyl`;
  } else {
    // Branched alkyl group - need to name the branches
    const branchNames: string[] = [];
    
    for (const [position, branchCarbons] of branches) {
      for (const branchId of branchCarbons) {
        // Simple case: assume single carbon branch (methyl)
        // Position in IUPAC starts at 1, and branch is on the NEXT carbon in chain
        branchNames.push(`${position}-methyl`);
      }
    }
    
    const alkylPrefixes = ['', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec'];
    const baseName = chainLength < alkylPrefixes.length ? alkylPrefixes[chainLength] : `C${chainLength}-alk`;
    
    return `${branchNames.join('-')}${baseName}yl`;
  }
}

export function buildEsterName(parentStructure: any, esterGroup: any, molecule: any, functionalGroups: any[]): string {
  // Ester functional class nomenclature:
  // Monoester: [alkyl] [alkanoate] (e.g., "methyl acetate")
  // Complex alkyl: (substituted-alkyl)alkanoate (e.g., "(2-butanoyloxy-2-ethoxyethyl)butanoate")
  // Diester: [dialkyl] [numbered substituents] [alkanedioate] (e.g., "dimethyl 2-propoxybutanedioate")
  
  if (process.env.VERBOSE) {
    console.log('[buildEsterName] parentStructure:', JSON.stringify(parentStructure, null, 2));
    console.log('[buildEsterName] parentStructure.type:', parentStructure?.type);
    console.log('[buildEsterName] parentStructure.chain:', parentStructure?.chain);
    console.log('[buildEsterName] esterGroup:', esterGroup);
  }
  
  // Handle ring-based structures
  // We need to determine if the ring is on the acyl side or alkoxy side
  if (parentStructure.type === 'ring' && !parentStructure.chain) {
    // Check which side the ring is on by checking connectivity
    // First, let's identify the ester components
    let carbonylCarbonIdTemp: number | undefined;
    let esterOxygenIdTemp: number | undefined;
    
    if (esterGroup.atoms && esterGroup.atoms.length >= 2) {
      for (const atomOrId of esterGroup.atoms) {
        const atomId = typeof atomOrId === 'number' ? atomOrId : atomOrId.id;
        const atom = molecule.atoms[atomId];
        if (atom?.symbol === 'C') {
          const hasDoubleBondToO = molecule.bonds.some((bond: any) => 
            bond.type === 'double' &&
            ((bond.atom1 === atomId && molecule.atoms[bond.atom2]?.symbol === 'O') ||
             (bond.atom2 === atomId && molecule.atoms[bond.atom1]?.symbol === 'O'))
          );
          if (hasDoubleBondToO) {
            carbonylCarbonIdTemp = atomId;
            break;
          }
        }
      }
      
      if (carbonylCarbonIdTemp !== undefined) {
        for (const atomOrId of esterGroup.atoms) {
          const atomId = typeof atomOrId === 'number' ? atomOrId : atomOrId.id;
          const atom = molecule.atoms[atomId];
          if (atom?.symbol === 'O') {
            const isSingleBonded = molecule.bonds.some((bond: any) => 
              bond.type === 'single' &&
              ((bond.atom1 === carbonylCarbonIdTemp && bond.atom2 === atomId) ||
               (bond.atom2 === carbonylCarbonIdTemp && bond.atom1 === atomId))
            );
            if (isSingleBonded) {
              esterOxygenIdTemp = atomId;
              break;
            }
          }
        }
      }
    }
    
    // Now check if the ring atoms include the carbonyl carbon (acyl side) or not (alkoxy side)
    // OR if the carbonyl carbon is bonded to a ring atom (ring substituent on acyl side)
    const ringAtomIds = new Set(
      (parentStructure.ring?.atoms || parentStructure.atoms || []).map((a: any) => a.id)
    );
    
    let isRingOnAcylSide = carbonylCarbonIdTemp !== undefined && ringAtomIds.has(carbonylCarbonIdTemp);
    
    // Also check if carbonyl carbon is bonded to any ring atom
    if (!isRingOnAcylSide && carbonylCarbonIdTemp !== undefined) {
      for (const bond of molecule.bonds) {
        if (bond.type === 'single') {
          if (bond.atom1 === carbonylCarbonIdTemp && ringAtomIds.has(bond.atom2)) {
            isRingOnAcylSide = true;
            break;
          } else if (bond.atom2 === carbonylCarbonIdTemp && ringAtomIds.has(bond.atom1)) {
            isRingOnAcylSide = true;
            break;
          }
        }
      }
    }
    
    if (process.env.VERBOSE) {
      console.log('[buildEsterName] Ring detected: isRingOnAcylSide=', isRingOnAcylSide);
      console.log('[buildEsterName] carbonylCarbonIdTemp=', carbonylCarbonIdTemp, 'ringAtomIds=', Array.from(ringAtomIds));
    }
    
    if (isRingOnAcylSide) {
      // Ring is on acyl side - build ring-based acyl name
      // (e.g., "alkyl cyclopentanecarboxylate")
      if (process.env.VERBOSE) console.log('[buildEsterName] Ring is on acyl side, calling buildEsterWithRingAcylGroup');
      return buildEsterWithRingAcylGroup(parentStructure, esterGroup, molecule, functionalGroups);
    } else {
      // Ring is on alkoxy side - handle as ring-based alkyl group
      // (e.g., "cyclohexyl propanoate")
      if (process.env.VERBOSE) console.log('[buildEsterName] Ring is on alkoxy side, building ring-based alkyl group');
      return buildEsterWithRingAlkylGroup(parentStructure, esterGroup, molecule, functionalGroups);
    }
  }
  
  if (!parentStructure.chain) {
    if (process.env.VERBOSE) console.log('[buildEsterName] ERROR: No chain in parentStructure, returning fallback');
    return 'alkyl carboxylate'; // Fallback
  }
  
  const chain = parentStructure.chain;
  const multiplicity = esterGroup.multiplicity || 1;
  const isMultiester = multiplicity > 1;
  
  if (process.env.VERBOSE) {
    console.log('[buildEsterName] multiplicity:', multiplicity, 'isMultiester:', isMultiester);
    console.log('[buildEsterName] chain.atoms:', chain.atoms?.length, 'chain.length:', chain.length);
  }
  
  if (isMultiester) {
    return buildDiesterName(parentStructure, esterGroup, molecule);
  }
  
  // Original monoester logic
  const chainAtomIds = chain.atoms?.map((a: any) => a.id) || [];
  
  // Use esterGroup.atoms to identify the specific ester we're processing
  // esterGroup.atoms typically contains [carbonyl C, ester O]
  let carbonylCarbonId: number | undefined;
  let esterOxygenId: number | undefined;
  
  if (esterGroup.atoms && esterGroup.atoms.length >= 2) {
    // esterGroup.atoms typically contains [carbonyl C, carbonyl O, ester O]
    // We need to identify:
    // 1. carbonyl carbon (has C=O double bond)
    // 2. ester oxygen (single bonded to carbonyl C and to alkoxy C)
    
    if (process.env.VERBOSE) {
      console.log('[buildEsterName] esterGroup.atoms:', esterGroup.atoms);
      esterGroup.atoms.forEach((atomOrId: number | any, idx: number) => {
        const atomId = typeof atomOrId === 'number' ? atomOrId : atomOrId.id;
        const atom = molecule.atoms[atomId];
        console.log(`[buildEsterName]   atoms[${idx}]: ${atomId} = ${atom?.symbol}`);
      });
    }
    
    // Find carbonyl carbon (should be bonded to one oxygen via double bond)
    for (const atomOrId of esterGroup.atoms) {
      const atomId = typeof atomOrId === 'number' ? atomOrId : atomOrId.id;
      const atom = molecule.atoms[atomId];
      if (atom?.symbol === 'C') {
        // Verify it has a double bond to an oxygen
        const hasDoubleBondToO = molecule.bonds.some((bond: any) => 
          bond.type === 'double' &&
          ((bond.atom1 === atomId && molecule.atoms[bond.atom2]?.symbol === 'O') ||
           (bond.atom2 === atomId && molecule.atoms[bond.atom1]?.symbol === 'O'))
        );
        if (hasDoubleBondToO) {
          carbonylCarbonId = atomId;
          break;
        }
      }
    }
    
    // Find ester oxygen (bonded to carbonyl C via single bond, not double bond)
    if (carbonylCarbonId !== undefined) {
      for (const atomOrId of esterGroup.atoms) {
        const atomId = typeof atomOrId === 'number' ? atomOrId : atomOrId.id;
        const atom = molecule.atoms[atomId];
        if (atom?.symbol === 'O') {
          // Check if this oxygen is single-bonded to the carbonyl carbon
          const isSingleBonded = molecule.bonds.some((bond: any) => 
            bond.type === 'single' &&
            ((bond.atom1 === carbonylCarbonId && bond.atom2 === atomId) ||
             (bond.atom2 === carbonylCarbonId && bond.atom1 === atomId))
          );
          if (isSingleBonded) {
            esterOxygenId = atomId;
            break;
          }
        }
      }
    }
    
    if (process.env.VERBOSE) {
      console.log('[buildEsterName] Identified from esterGroup: carbonylCarbonId=', carbonylCarbonId, 'esterOxygenId=', esterOxygenId);
    }
  }
  
  // Fallback to searching if esterGroup doesn't specify atoms
  if (!carbonylCarbonId || !esterOxygenId) {
    if (process.env.VERBOSE) console.log('[buildEsterName] Fallback: searching for carbonyl and ester oxygen');
    for (const bond of molecule.bonds) {
      if (bond.type === 'double') {
        const atom1 = molecule.atoms[bond.atom1];
        const atom2 = molecule.atoms[bond.atom2];
        
        if (atom1?.symbol === 'C' && atom2?.symbol === 'O') {
          carbonylCarbonId = bond.atom1;
        } else if (atom1?.symbol === 'O' && atom2?.symbol === 'C') {
          carbonylCarbonId = bond.atom2;
        }
      }
    }
    
    if (!carbonylCarbonId) {
      if (process.env.VERBOSE) console.log('[buildEsterName] ERROR: Could not find carbonyl carbon');
      return 'alkyl carboxylate';
    }
    
    for (const bond of molecule.bonds) {
      if (bond.type === 'single') {
        const atom1 = molecule.atoms[bond.atom1];
        const atom2 = molecule.atoms[bond.atom2];
        
        if (bond.atom1 === carbonylCarbonId && atom1?.symbol === 'C' && atom2?.symbol === 'O') {
          esterOxygenId = bond.atom2;
          break;
        } else if (bond.atom2 === carbonylCarbonId && atom2?.symbol === 'C' && atom1?.symbol === 'O') {
          esterOxygenId = bond.atom1;
          break;
        }
      }
    }
  }
  
  if (!esterOxygenId) {
    return 'alkyl carboxylate';
  }
  
  let alkoxyCarbonId: number | undefined;
  for (const bond of molecule.bonds) {
    if (bond.type === 'single') {
      const atom1 = molecule.atoms[bond.atom1];
      const atom2 = molecule.atoms[bond.atom2];
      
      if (bond.atom1 === esterOxygenId && atom2?.symbol === 'C' && bond.atom2 !== carbonylCarbonId) {
        alkoxyCarbonId = bond.atom2;
        break;
      } else if (bond.atom2 === esterOxygenId && atom1?.symbol === 'C' && bond.atom1 !== carbonylCarbonId) {
        alkoxyCarbonId = bond.atom1;
        break;
      }
    }
  }
  
  if (!alkoxyCarbonId) {
    if (process.env.VERBOSE) console.log('[buildEsterName] ERROR: Could not find alkoxyCarbonId, returning fallback');
    return 'alkyl carboxylate';
  }
  
  if (process.env.VERBOSE) console.log('[buildEsterName] Found alkoxyCarbonId:', alkoxyCarbonId);
  
  const acylCarbonIds = new Set<number>();
  const visitedAcyl = new Set<number>();
  const queueAcyl = [carbonylCarbonId];
  
  while (queueAcyl.length > 0) {
    const currentId = queueAcyl.shift()!;
    if (visitedAcyl.has(currentId)) continue;
    visitedAcyl.add(currentId);
    
    const currentAtom = molecule.atoms[currentId];
    if (currentAtom?.symbol === 'C') {
      acylCarbonIds.add(currentId);
      
      for (const bond of molecule.bonds) {
        if (bond.atom1 === currentId || bond.atom2 === currentId) {
          const otherId = bond.atom1 === currentId ? bond.atom2 : bond.atom1;
          const otherAtom = molecule.atoms[otherId];
          
          if (otherId === esterOxygenId) continue;
          
          if (otherAtom?.symbol === 'C' && !visitedAcyl.has(otherId)) {
            queueAcyl.push(otherId);
          }
        }
      }
    }
  }
  
  const acylLength = acylCarbonIds.size;
  
  const alkoxyCarbonIds = new Set<number>();
  const visitedAlkoxy = new Set<number>();
  const queueAlkoxy = [alkoxyCarbonId];
  
  while (queueAlkoxy.length > 0) {
    const currentId = queueAlkoxy.shift()!;
    if (visitedAlkoxy.has(currentId)) continue;
    visitedAlkoxy.add(currentId);
    
    const currentAtom = molecule.atoms[currentId];
    if (currentAtom?.symbol === 'C') {
      alkoxyCarbonIds.add(currentId);
      
      for (const bond of molecule.bonds) {
        if (bond.atom1 === currentId || bond.atom2 === currentId) {
          const otherId = bond.atom1 === currentId ? bond.atom2 : bond.atom1;
          const otherAtom = molecule.atoms[otherId];
          
          if (otherAtom?.symbol === 'C' && !visitedAlkoxy.has(otherId)) {
            queueAlkoxy.push(otherId);
          }
        }
      }
    }
  }
  
  const alkoxyLength = alkoxyCarbonIds.size;
  
  if (process.env.VERBOSE) {
    console.log('[buildEsterName] carbonylCarbonId:', carbonylCarbonId);
    console.log('[buildEsterName] esterOxygenId:', esterOxygenId);
    console.log('[buildEsterName] alkoxyCarbonId:', alkoxyCarbonId);
    console.log('[buildEsterName] acylLength:', acylLength);
    console.log('[buildEsterName] alkoxyLength:', alkoxyLength);
    console.log('[buildEsterName] alkoxyCarbonIds:', Array.from(alkoxyCarbonIds));
  }
  
  // Check if alkoxy chain has substituents (acyloxy, alkoxy groups)
  const alkoxySubstituents = functionalGroups.filter(fg => 
    (fg.type === 'acyloxy' || fg.type === 'alkoxy') && 
    fg.atoms && 
    fg.atoms.some((atomId: number) => {
      // Check if this functional group is attached to the alkoxy chain
      for (const bond of molecule.bonds) {
        const atom1 = bond.atom1;
        const atom2 = bond.atom2;
        if (alkoxyCarbonIds.has(atom1) && atomId === atom2) return true;
        if (alkoxyCarbonIds.has(atom2) && atomId === atom1) return true;
      }
      return false;
    })
  );

  // Also consider substituents recorded on the parent chain (which may represent the alkoxy chain)
  // e.g., trimethylsilyloxy recorded in parentStructure.chain.substituents for the alkoxy group
  try {
    const parentSubstituents = parentStructure.chain?.substituents || [];
    for (const sub of parentSubstituents) {
      // Avoid duplicates by checking if a similar type already exists in alkoxySubstituents
      const key = (sub.type || sub.name || '').toString();
      // We'll attempt to find an attachment atom below; declare here so we can merge if needed
      let attachmentAtomId: number | undefined;
      const exists = alkoxySubstituents.some((s: any) => (s.type || s.prefix || s.name || '').toString() === key);
  if (!exists) {
        // Attempt to find the attachment atom in the molecule for this substituent
        let attachmentAtomId: number | undefined;

        try {
          // If substituent looks like a silyloxy group, find an O bonded to an alkoxy carbon that connects to Si
          const typeStr = (sub.type || sub.name || '').toString().toLowerCase();
          if (typeStr.includes('silyl') || typeStr.includes('silyloxy') || typeStr.includes('trimethylsilyl')) {
            for (const cid of Array.from(alkoxyCarbonIds)) {
              for (const b of molecule.bonds) {
                if (b.type !== 'single') continue;
                const other = b.atom1 === cid ? b.atom2 : (b.atom2 === cid ? b.atom1 : undefined);
                if (other === undefined) continue;
                const otherAtom = molecule.atoms[other];
                if (!otherAtom || otherAtom.symbol !== 'O') continue;
                // check if this oxygen connects to Si
                const neigh = molecule.bonds
                  .filter((bb: any) => (bb.atom1 === other || bb.atom2 === other) && bb.type === 'single')
                  .map((bb: any) => (bb.atom1 === other ? bb.atom2 : bb.atom1))
                  .map((id: number) => molecule.atoms[id]);
                if (neigh.some((na: any) => na && na.symbol === 'Si')) {
                  attachmentAtomId = other;
                  break;
                }
              }
              if (attachmentAtomId) break;
            }
          }

          // Fallback: find a carbon neighbor of alkoxy carbons that likely represents a simple alkyl branch
          if (!attachmentAtomId) {
            for (const cid of Array.from(alkoxyCarbonIds)) {
              for (const b of molecule.bonds) {
                if (b.type !== 'single') continue;
                const other = b.atom1 === cid ? b.atom2 : (b.atom2 === cid ? b.atom1 : undefined);
                if (other === undefined) continue;
                const otherAtom = molecule.atoms[other];
                if (!otherAtom) continue;
                if (otherAtom.symbol === 'C' && !alkoxyCarbonIds.has(other)) {
                  attachmentAtomId = other;
                  break;
                }
              }
              if (attachmentAtomId) break;
            }
          }
        } catch (e) {
          // ignore errors, leave attachmentAtomId undefined
        }

        const newEntry: any = {
          type: sub.type || sub.name || 'substituent',
          prefix: sub.prefix || sub.name || undefined,
          atoms: attachmentAtomId ? [attachmentAtomId] : [],
          isPrincipal: false
        };

        alkoxySubstituents.push(newEntry);
      } else {
        // merge attachment atom into existing entry so multiplicities (bis/tri) can be computed
        if (attachmentAtomId) {
          const existing = alkoxySubstituents.find((s: any) => (s.type || s.prefix || s.name || '').toString() === key);
          if (existing) {
            existing.atoms = existing.atoms || [];
            if (!existing.atoms.includes(attachmentAtomId)) existing.atoms.push(attachmentAtomId);
          }
        }
      }
    }
  } catch (e) {
    // non-fatal - just proceed
  }
  
  if (process.env.VERBOSE) {
    console.log('[buildEsterName] alkoxySubstituents:', alkoxySubstituents.map(s => ({ type: s.type, prefix: s.prefix, atoms: s.atoms })));
  }
  
  let alkylName: string;
  
  if (alkoxySubstituents.length > 0) {
    // Complex alkoxy group with substituents - build detailed name
    // Convert alkoxyCarbonIds to ordered chain (BFS from alkoxyCarbonId)
    const alkoxyChain: number[] = [];
    const visited = new Set<number>();
    const queue = [alkoxyCarbonId];
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      
      if (molecule.atoms[currentId]?.symbol === 'C' && alkoxyCarbonIds.has(currentId)) {
        alkoxyChain.push(currentId);
        
        for (const bond of molecule.bonds) {
          if (bond.atom1 === currentId || bond.atom2 === currentId) {
            const otherId = bond.atom1 === currentId ? bond.atom2 : bond.atom1;
            if (alkoxyCarbonIds.has(otherId) && !visited.has(otherId)) {
              queue.push(otherId);
            }
          }
        }
      }
    }
    
    if (process.env.VERBOSE) {
      console.log('[buildEsterName] alkoxyChain:', alkoxyChain);
    }
    
    // Create atom ID to locant mapping
    const atomIdToLocant = new Map<number, number>();
    alkoxyChain.forEach((atomId, index) => {
      atomIdToLocant.set(atomId, index + 1);
    });
    
    // Build substituent prefixes with locants
    const substituentParts: string[] = [];
    const substituentGroups = new Map<string, number[]>();

    // First, incorporate any known alkoxySubstituents (from functional groups / parent substituents)
    for (const sub of alkoxySubstituents) {
      const subName = sub.prefix || sub.name || sub.type;
      let attachmentCarbon: number | undefined;
      if (sub.atoms && sub.atoms.length > 0) {
        // Try to find an alkoxy carbon connected to one of the atoms reported for this substituent
        for (const atomId of sub.atoms) {
          for (const bond of molecule.bonds) {
            if (bond.atom1 === atomId && alkoxyCarbonIds.has(bond.atom2)) {
              attachmentCarbon = bond.atom2; break;
            } else if (bond.atom2 === atomId && alkoxyCarbonIds.has(bond.atom1)) {
              attachmentCarbon = bond.atom1; break;
            }
          }
          if (attachmentCarbon !== undefined) break;
        }
      }

      if (attachmentCarbon !== undefined && subName) {
        const locant = atomIdToLocant.get(attachmentCarbon);
        if (locant) {
          if (!substituentGroups.has(subName)) substituentGroups.set(subName, []);
          substituentGroups.get(subName)!.push(locant);
        }
      }
    }

    // Next, scan the alkoxy chain directly to discover substituents (robust against missing atoms arrays)
    for (const atomId of alkoxyChain) {
      const locant = atomIdToLocant.get(atomId);
      if (!locant) continue;

      for (const bond of molecule.bonds) {
        const otherId = bond.atom1 === atomId ? bond.atom2 : (bond.atom2 === atomId ? bond.atom1 : undefined);
        if (otherId === undefined) continue;
        const otherAtom = molecule.atoms[otherId];
        if (!otherAtom) continue;

        // Detect silyloxy: oxygen neighbor that connects to Si
        if (otherAtom.symbol === 'O') {
          const neigh = molecule.bonds
            .filter((bb: any) => (bb.atom1 === otherId || bb.atom2 === otherId) && bb.type === 'single')
            .map((bb: any) => (bb.atom1 === otherId ? bb.atom2 : bb.atom1))
            .map((id: number) => molecule.atoms[id]);
          if (neigh.some((na: any) => na && na.symbol === 'Si')) {
            const name = 'trimethylsilyloxy';
            if (!substituentGroups.has(name)) substituentGroups.set(name, []);
            substituentGroups.get(name)!.push(locant);
            continue;
          }
        }

        // Detect simple alkyl branch (methyl)
        if (otherAtom.symbol === 'C' && !alkoxyCarbonIds.has(otherId)) {
          // Heuristic: terminal carbon (degree 1) -> methyl
          if (otherAtom.degree <= 1 || molecule.bonds.filter((bb: any) => bb.atom1 === otherId || bb.atom2 === otherId).length <= 1) {
            const name = 'methyl';
            if (!substituentGroups.has(name)) substituentGroups.set(name, []);
            substituentGroups.get(name)!.push(locant);
            continue;
          }
          // Could be larger branch; name as alkyl (fallback)
          const name = 'alkyl';
          if (!substituentGroups.has(name)) substituentGroups.set(name, []);
          substituentGroups.get(name)!.push(locant);
        }
      }
    }
    
    // Format substituent parts: group locants, dedupe, and use multiplicative words for complex substituents
    for (const [subName, locants] of substituentGroups.entries()) {
      const uniqueLocants = Array.from(new Set(locants)).sort((a, b) => a - b);
      const locantStr = uniqueLocants.join(',');
      if (uniqueLocants.length > 1) {
        const multWords: any = {2: 'bis', 3: 'tris', 4: 'tetrakis'};
        const mult = multWords[uniqueLocants.length] || getMultiplicativePrefix(uniqueLocants.length);
        substituentParts.push(`${locantStr}-${mult}(${subName})`);
      } else {
        substituentParts.push(`${locantStr}-${subName}`);
      }
    }

    // Sort substituent parts alphabetically by substituent name (after the locant and dash)
    substituentParts.sort((a, b) => {
      const aName = a.replace(/^[0-9,\-]+-/, '');
      const bName = b.replace(/^[0-9,\-]+-/, '');
      return aName.localeCompare(bName);
    });

    // Build base alkyl name
    const alkylNames = ['', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec'];
    const baseSuffix = (alkoxyLength < alkylNames.length && alkylNames[alkoxyLength]) ? alkylNames[alkoxyLength] : `C${alkoxyLength}-alk`;
    const substituentPrefix = substituentParts.length > 0 ? substituentParts.join('') : '';
    // For substituted alkyls, combine substituent prefix + baseSuffix + 'yl'
    alkylName = substituentPrefix ? `${substituentPrefix}${baseSuffix}yl` : `${baseSuffix}yl`;
  } else {
    // Simple alkoxy group - use getAlkoxyGroupName to detect branching
    alkylName = getAlkoxyGroupName(esterGroup, molecule);
  }
  
  // Prefer deriving the acyl name from the parentStructure.chain when the parent chain contains the carbonyl carbon
  let acylName = '';
  try {
  const parentChainAtoms = (parentStructure.chain?.atoms || []).map((a: any) => (a && typeof a === 'object' && typeof a.id === 'number') ? a.id : a);
    const parentIsAcyl = carbonylCarbonId !== undefined && parentChainAtoms.includes(carbonylCarbonId);

    if (parentIsAcyl) {
      if (process.env.VERBOSE) console.log('[buildEsterName] parentIsAcyl true, parentChainAtoms:', parentChainAtoms);
      // Count carbon atoms in parent chain
      const carbonCount = (parentStructure.chain?.atoms || []).filter((a: any) => {
        const atomId = (a && typeof a === 'object' && typeof a.id === 'number') ? a.id : a;
        return molecule.atoms[atomId]?.symbol === 'C';
      }).length;
      if (process.env.VERBOSE) console.log('[buildEsterName] computed carbonCount from parent chain:', carbonCount);

      // Build substituent part from parent chain substituents (e.g., 2-methyl)
      const acylSubs = parentStructure.chain?.substituents || [];
      const acylSubParts: string[] = [];
      for (const s of acylSubs) {
        const loc = s.locant || s.position;
        const name = s.name || s.type;
        if (loc && name && !(name || '').toLowerCase().includes('oxy')) {
          acylSubParts.push(`${loc}-${name}`);
        }
      }

      const baseNames = ['', 'methane', 'ethane', 'propane', 'butane', 'pentane', 'hexane', 'heptane', 'octane', 'nonane', 'decane'];
      const base = carbonCount < baseNames.length ? baseNames[carbonCount] : `C${carbonCount}-alkane`;
    const baseAnoate = (base || '').replace('ane', 'anoate');
    acylName = acylSubParts.length > 0 ? `${acylSubParts.join(',')}${baseAnoate}` : baseAnoate;
    } else {
      const acylNames = ['', 'formate', 'acetate', 'propanoate', 'butanoate', 'pentanoate', 'hexanoate', 
        'heptanoate', 'octanoate', 'nonanoate', 'decanoate'];
        acylName = (acylLength < acylNames.length && acylNames[acylLength]) ? acylNames[acylLength] : `C${acylLength}-anoate`;
    }
  } catch (e) {
    const acylNames = ['', 'formate', 'acetate', 'propanoate', 'butanoate', 'pentanoate', 'hexanoate', 
      'heptanoate', 'octanoate', 'nonanoate', 'decanoate'];
      acylName = (acylLength < acylNames.length && acylNames[acylLength]) ? acylNames[acylLength] : `C${acylLength}-anoate`;
  }
  
  const result = alkoxySubstituents.length > 0 ? `${alkylName}${acylName}` : `${alkylName} ${acylName}`;
  
  if (process.env.VERBOSE) {
    console.log('[buildEsterName] result:', result);
  }
  
  return result;
}

export function buildDiesterName(parentStructure: any, esterGroup: any, molecule: any): string {
  // Diester nomenclature: dialkyl [substituents] alkanedioate
  // Example: CCCOC(CC(=O)OC)C(=O)OC → dimethyl 2-propoxybutanedioate
  
  const chain = parentStructure.chain;
  const multiplicity = esterGroup.multiplicity || 2;
  
  // Find all ester oxygens (C-O-C where C=O is present)
  const esterOxygens: number[] = [];
  const alkoxyCarbons: number[] = [];
  
  for (const bond of molecule.bonds) {
    if (bond.type !== 'double') continue;
    
    const atom1 = molecule.atoms[bond.atom1];
    const atom2 = molecule.atoms[bond.atom2];
    let carbonylCarbonId: number | undefined;
    
    if (atom1?.symbol === 'C' && atom2?.symbol === 'O') {
      carbonylCarbonId = bond.atom1;
    } else if (atom1?.symbol === 'O' && atom2?.symbol === 'C') {
      carbonylCarbonId = bond.atom2;
    }
    
    if (!carbonylCarbonId) continue;
    
    // Find ester oxygen bonded to this carbonyl carbon
    for (const bond2 of molecule.bonds) {
      if (bond2.type !== 'single') continue;
      
      const b1 = molecule.atoms[bond2.atom1];
      const b2 = molecule.atoms[bond2.atom2];
      
      let esterOxygenId: number | undefined;
      if (bond2.atom1 === carbonylCarbonId && b1?.symbol === 'C' && b2?.symbol === 'O') {
        esterOxygenId = bond2.atom2;
      } else if (bond2.atom2 === carbonylCarbonId && b2?.symbol === 'C' && b1?.symbol === 'O') {
        esterOxygenId = bond2.atom1;
      }
      
      if (!esterOxygenId) continue;
      
      // Find alkoxy carbon
      for (const bond3 of molecule.bonds) {
        if (bond3.type !== 'single') continue;
        
        const c1 = molecule.atoms[bond3.atom1];
        const c2 = molecule.atoms[bond3.atom2];
        
        if (bond3.atom1 === esterOxygenId && c2?.symbol === 'C' && bond3.atom2 !== carbonylCarbonId) {
          esterOxygens.push(esterOxygenId);
          alkoxyCarbons.push(bond3.atom2);
          break;
        } else if (bond3.atom2 === esterOxygenId && c1?.symbol === 'C' && bond3.atom1 !== carbonylCarbonId) {
          esterOxygens.push(esterOxygenId);
          alkoxyCarbons.push(bond3.atom1);
          break;
        }
      }
    }
  }
  
  if (process.env.VERBOSE) {
    console.log('[buildDiesterName] Found', alkoxyCarbons.length, 'ester groups');
  }
  
  // Calculate length of each alkoxy chain
  const alkoxyLengths: number[] = [];
  for (const alkoxyCarbonId of alkoxyCarbons) {
    const visited = new Set<number>();
    const queue = [alkoxyCarbonId];
    const carbonIds = new Set<number>();
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      
      const currentAtom = molecule.atoms[currentId];
      if (currentAtom?.symbol === 'C') {
        carbonIds.add(currentId);
        
        for (const bond of molecule.bonds) {
          if (bond.atom1 === currentId || bond.atom2 === currentId) {
            const otherId = bond.atom1 === currentId ? bond.atom2 : bond.atom1;
            const otherAtom = molecule.atoms[otherId];
            
            if (otherAtom?.symbol === 'C' && !visited.has(otherId) && !esterOxygens.includes(otherId)) {
              queue.push(otherId);
            }
          }
        }
      }
    }
    
    alkoxyLengths.push(carbonIds.size);
  }
  
  // Check if all alkoxy groups are the same length
  const allSameLength = alkoxyLengths.every(len => len === alkoxyLengths[0]);
  
  const alkylNames = [
    '', 'methyl', 'ethyl', 'propyl', 'butyl', 'pentyl', 'hexyl', 'heptyl', 'octyl', 'nonyl', 'decyl'
  ];
  
  let alkylPart = '';
  if (allSameLength && alkoxyLengths.length > 0) {
    const len = alkoxyLengths[0] ?? 1;
    const baseName = (len < alkylNames.length && len >= 0) ? (alkylNames[len] ?? 'methyl') : `C${len}-alkyl`;
    const multiplicativePrefix = getMultiplicativePrefix(alkoxyLengths.length);
    alkylPart = `${multiplicativePrefix}${baseName}`;
  } else {
    alkylPart = 'mixed alkyl';
  }
  
  // Get substituents from parent structure, excluding ester alkoxy groups
  // Ester alkoxy groups are at the same positions as the ester carbonyl groups
  // Parse locantString to get all ester positions (e.g., "2,5" -> [2, 5])
  const locantString = esterGroup.locantString || '';
  const esterLocants = new Set<number>(
    locantString.split(',').map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n))
  );
  
  const substituents = (chain.substituents || []).filter((sub: any) => {
    const subLocant = sub.locant || sub.position;
    const isAlkoxySubstituent = sub.type?.includes('oxy'); // methoxy, ethoxy, propoxy, etc.
    
    // Exclude alkoxy substituents at ester positions (they're part of the ester)
    if (isAlkoxySubstituent && esterLocants.has(subLocant)) {
      return false;
    }
    
    return true;
  });
  
  // Count carbons in acid chain (excluding alkoxy groups)
  const chainAtomIds = new Set<number>(chain.atoms?.map((a: any) => a.id) || []);
  const alkoxyCarbonSet = new Set<number>(alkoxyCarbons);
  const acidChainCarbons = Array.from(chainAtomIds).filter((id: number) => {
    const atom = molecule.atoms[id];
    return atom?.symbol === 'C' && !alkoxyCarbonSet.has(id);
  });
  
  // Build mapping from atom ID to carbon-only position
  const chainAtoms = chain.atoms || [];
  const carbonOnlyPositions = new Map<number, number>();
  let carbonPosition = 1;
  for (let i = 0; i < chainAtoms.length; i++) {
    const atomId = chainAtoms[i]?.id;
    const atom = molecule.atoms[atomId];
    if (atom?.symbol === 'C' && !alkoxyCarbonSet.has(atomId)) {
      carbonOnlyPositions.set(atomId, carbonPosition);
      carbonPosition++;
    }
  }
  
  // Re-calculate substituent locants based on carbon-only positions
  const renumberedSubstituents = substituents.map((sub: any) => {
    const subLocant = sub.locant || sub.position;
    const chainAtomAtPosition = chainAtoms[subLocant - 1];
    const atomId = chainAtomAtPosition?.id;
    
    // The chain atom at this position might be an oxygen (for carbonyl groups)
    // We need to find the carbon that this substituent is actually attached to
    let attachedCarbonId: number | undefined;
    
    // If the chain atom itself is a carbon in our carbon-only positions, use it
    if (carbonOnlyPositions.has(atomId)) {
      attachedCarbonId = atomId;
    } else {
      // Otherwise, find the carbon that this oxygen is bonded to
      for (const bond of molecule.bonds) {
        if (bond.atom1 === atomId || bond.atom2 === atomId) {
          const otherId = bond.atom1 === atomId ? bond.atom2 : bond.atom1;
          if (carbonOnlyPositions.has(otherId)) {
            attachedCarbonId = otherId;
            break;
          }
        }
      }
    }
    
    const newLocant = attachedCarbonId !== undefined ? carbonOnlyPositions.get(attachedCarbonId) : subLocant;
    return { ...sub, locant: newLocant };
  });
  
  let substituentPart = '';
  if (renumberedSubstituents.length > 0) {
    const subParts: string[] = [];
    for (const sub of renumberedSubstituents) {
      const locant = sub.locant || sub.position;
      const name = sub.name || sub.type;
      if (locant && name) {
        subParts.push(`${locant}-${name}`);
      }
    }
    if (subParts.length > 0) {
      substituentPart = subParts.join(',') + '';
    }
  }
  
  const acidChainLength = acidChainCarbons.length;
  
  const chainNames = [
    '', 'methane', 'ethane', 'propane', 'butane', 'pentane', 'hexane', 'heptane', 'octane', 'nonane', 'decane'
  ];
  
  let acidSuffix = '';
  if (acidChainLength < chainNames.length) {
    const baseName = chainNames[acidChainLength] || 'alkane';
    acidSuffix = baseName.replace('ane', 'anedioate');
  } else {
    acidSuffix = `C${acidChainLength}-anedioate`;
  }
  
  const result = substituentPart 
    ? `${alkylPart}${substituentPart}${acidSuffix}`
    : `${alkylPart}${acidSuffix}`;
  
  if (process.env.VERBOSE) {
    console.log('[buildDiesterName] result:', result);
  }
  
  return result;
}

function getMultiplicativePrefix(count: number): string {
  const prefixes: { [key: number]: string } = {
    2: 'di', 3: 'tri', 4: 'tetra', 5: 'penta', 6: 'hexa',
    7: 'hepta', 8: 'octa', 9: 'nona', 10: 'deca'
  };
  
  return prefixes[count] || `${count}-`;
}
