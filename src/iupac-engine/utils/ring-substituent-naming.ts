import type { Molecule, Atom } from '../../../types';
import { analyzeRings } from 'src/utils/ring-analysis';

export interface RingSubstituentInfo {
  ringAtoms: number[];
  ringName: string;
  attachmentPosition: number;
  fullName: string;
}

export function detectRingInAlkoxyGroup(
  alkoxyCarbonIds: Set<number>,
  molecule: Molecule
): number[][] {
  const ringInfo = analyzeRings(molecule);
  const ringsInAlkoxy: number[][] = [];
  
  for (const ring of ringInfo.rings) {
    const ringIntersection = ring.filter(atomId => alkoxyCarbonIds.has(atomId));
    if (ringIntersection.length >= 3) {
      ringsInAlkoxy.push(ring);
    }
  }
  
  return ringsInAlkoxy;
}

export function nameRingSubstituent(
  ring: number[],
  attachmentAtomId: number,
  molecule: Molecule
): RingSubstituentInfo | null {
  const ringSize = ring.length;
  const ringAtoms = ring.map(id => molecule.atoms[id]).filter((a): a is Atom => a !== undefined);
  
  const heteroatomCounts: Record<string, number> = {};
  for (const atom of ringAtoms) {
    if (atom.symbol !== 'C') {
      heteroatomCounts[atom.symbol] = (heteroatomCounts[atom.symbol] || 0) + 1;
    }
  }
  
  const hasOxygen = heteroatomCounts['O'] || 0;
  const hasNitrogen = heteroatomCounts['N'] || 0;
  const hasSulfur = heteroatomCounts['S'] || 0;
  const totalHetero = hasOxygen + hasNitrogen + hasSulfur;
  
  // For heteroatom rings, reorder so heteroatom is at position 1
  let orderedRing = [...ring];
  if (totalHetero === 1) {
    const heteroAtomId = ring.find(atomId => {
      const atom = molecule.atoms[atomId];
      return atom && atom.symbol !== 'C';
    });
    
    if (heteroAtomId !== undefined) {
      const heteroIndex = ring.indexOf(heteroAtomId);
      if (heteroIndex > 0) {
        // Rotate the ring so heteroatom is first
        orderedRing = [...ring.slice(heteroIndex), ...ring.slice(0, heteroIndex)];
        if (process.env.VERBOSE) {
          console.log(`[nameRingSubstituent] Reordered ring to start with heteroatom: ${ring} -> ${orderedRing}`);
        }
      }
    }
  }
  
  let isSaturated = true;
  for (const bond of molecule.bonds) {
    const isInRing = orderedRing.includes(bond.atom1) && orderedRing.includes(bond.atom2);
    if (isInRing && bond.type === 'double') {
      isSaturated = false;
      break;
    }
  }
  
  let ringBaseName: string | null = null;
  
  if (isSaturated && totalHetero === 1) {
    if (ringSize === 5 && hasOxygen === 1) {
      ringBaseName = 'oxolan';
    } else if (ringSize === 5 && hasNitrogen === 1) {
      ringBaseName = 'pyrrolidin';
    } else if (ringSize === 5 && hasSulfur === 1) {
      ringBaseName = 'thiolan';
    } else if (ringSize === 6 && hasOxygen === 1) {
      ringBaseName = 'oxan';
    } else if (ringSize === 6 && hasNitrogen === 1) {
      ringBaseName = 'piperidin';
    } else if (ringSize === 6 && hasSulfur === 1) {
      ringBaseName = 'thian';
    }
  }
  
  if (!ringBaseName) {
    if (isSaturated && totalHetero === 0) {
      const cycloNames: { [key: number]: string } = {
        3: 'cycloprop',
        4: 'cyclobut',
        5: 'cyclopent',
        6: 'cyclohex',
        7: 'cyclohept',
        8: 'cyclooct'
      };
      ringBaseName = cycloNames[ringSize] || `cycloC${ringSize}`;
    }
  }
  
  if (!ringBaseName) {
    return null;
  }
  
  const attachmentPosition = getAttachmentPosition(orderedRing, attachmentAtomId, molecule);
  
  const positionStr = attachmentPosition > 1 ? `${attachmentPosition}-` : '';
  const fullName = `${ringBaseName}-${positionStr}yl`;
  
  return {
    ringAtoms: orderedRing,
    ringName: ringBaseName,
    attachmentPosition,
    fullName
  };
}

function getAttachmentPosition(ring: number[], attachmentAtomId: number, molecule: Molecule): number {
  const ringSet = new Set(ring);
  
  if (process.env.VERBOSE) {
    console.log('[getAttachmentPosition] ring:', ring);
    console.log('[getAttachmentPosition] attachmentAtomId:', attachmentAtomId);
  }
  
  for (const bond of molecule.bonds) {
    const inRing1 = ringSet.has(bond.atom1);
    const inRing2 = ringSet.has(bond.atom2);
    
    if (process.env.VERBOSE) {
      console.log(`[getAttachmentPosition] Checking bond ${bond.atom1}-${bond.atom2}: inRing1=${inRing1}, inRing2=${inRing2}`);
    }
    
    if (inRing1 && !inRing2 && bond.atom2 === attachmentAtomId) {
      const position = ring.indexOf(bond.atom1) + 1;
      if (process.env.VERBOSE) {
        console.log(`[getAttachmentPosition] Found: ring atom ${bond.atom1} connects to attachment ${attachmentAtomId}, position=${position}`);
      }
      return position;
    } else if (inRing2 && !inRing1 && bond.atom1 === attachmentAtomId) {
      const position = ring.indexOf(bond.atom2) + 1;
      if (process.env.VERBOSE) {
        console.log(`[getAttachmentPosition] Found: ring atom ${bond.atom2} connects to attachment ${attachmentAtomId}, position=${position}`);
      }
      return position;
    }
  }
  
  return 1;
}

export function buildRingSubstituentAlkylName(
  alkoxyStartAtomId: number,
  esterOxygenId: number,
  molecule: Molecule
): string | null {
  if (process.env.VERBOSE) {
    console.log('[buildRingSubstituentAlkylName] Starting with alkoxyStartAtomId:', alkoxyStartAtomId, 'esterOxygenId:', esterOxygenId);
  }
  
  const visited = new Set<number>();
  const alkoxyCarbonIds = new Set<number>();
  const queue = [alkoxyStartAtomId];
  
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    
    const currentAtom = molecule.atoms[currentId];
    if (currentAtom?.symbol === 'C') {
      alkoxyCarbonIds.add(currentId);
      
      for (const bond of molecule.bonds) {
        if (bond.atom1 === currentId || bond.atom2 === currentId) {
          const otherId = bond.atom1 === currentId ? bond.atom2 : bond.atom1;
          const otherAtom = molecule.atoms[otherId];
          
          if (otherAtom?.symbol === 'C' && !visited.has(otherId) && otherId !== esterOxygenId) {
            queue.push(otherId);
          }
        }
      }
    }
  }
  
  if (process.env.VERBOSE) {
    console.log('[buildRingSubstituentAlkylName] alkoxyCarbonIds:', Array.from(alkoxyCarbonIds));
  }
  
  const ringsInAlkoxy = detectRingInAlkoxyGroup(alkoxyCarbonIds, molecule);
  
  if (process.env.VERBOSE) {
    console.log('[buildRingSubstituentAlkylName] ringsInAlkoxy:', ringsInAlkoxy);
  }
  
  if (ringsInAlkoxy.length === 0) {
    if (process.env.VERBOSE) {
      console.log('[buildRingSubstituentAlkylName] No rings found, returning null');
    }
    return null;
  }
  
  const ring = ringsInAlkoxy[0]!;
  const chainCarbons = Array.from(alkoxyCarbonIds).filter(id => !ring.includes(id));
  
  if (process.env.VERBOSE) {
    console.log('[buildRingSubstituentAlkylName] ring:', ring);
    console.log('[buildRingSubstituentAlkylName] chainCarbons:', chainCarbons);
  }
  
  if (chainCarbons.length === 0) {
    const ringSubInfo = nameRingSubstituent(ring, esterOxygenId, molecule);
    return ringSubInfo ? ringSubInfo.fullName : null;
  }
  
  let attachmentToRing: number | null = null;
  for (const bond of molecule.bonds) {
    const inRing1 = ring.includes(bond.atom1);
    const inRing2 = ring.includes(bond.atom2);
    const inChain1 = chainCarbons.includes(bond.atom1);
    const inChain2 = chainCarbons.includes(bond.atom2);
    
    if (inRing1 && inChain2) {
      attachmentToRing = bond.atom1;
      break;
    } else if (inRing2 && inChain1) {
      attachmentToRing = bond.atom2;
      break;
    }
  }
  
  if (process.env.VERBOSE) {
    console.log('[buildRingSubstituentAlkylName] attachmentToRing:', attachmentToRing);
  }
  
  if (!attachmentToRing) {
    return null;
  }
  
  // Find which carbon in the chain is attached to the ring
  let chainCarbonAttachedToRing: number | null = null;
  for (const bond of molecule.bonds) {
    const inRing1 = ring.includes(bond.atom1);
    const inRing2 = ring.includes(bond.atom2);
    const inChain1 = chainCarbons.includes(bond.atom1);
    const inChain2 = chainCarbons.includes(bond.atom2);
    
    if (inRing1 && inChain2) {
      chainCarbonAttachedToRing = bond.atom2;
      break;
    } else if (inRing2 && inChain1) {
      chainCarbonAttachedToRing = bond.atom1;
      break;
    }
  }
  
  if (process.env.VERBOSE) {
    console.log('[buildRingSubstituentAlkylName] chainCarbonAttachedToRing:', chainCarbonAttachedToRing);
  }
  
  if (!chainCarbonAttachedToRing) {
    return null;
  }
  
  const ringSubInfo = nameRingSubstituent(ring, chainCarbonAttachedToRing, molecule);
  if (!ringSubInfo) {
    return null;
  }
  
  const chainLength = chainCarbons.length;
  const alkylPrefixes = ['', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec'];
  const chainName = chainLength < alkylPrefixes.length ? alkylPrefixes[chainLength] : `C${chainLength}-alk`;
  
  if (process.env.VERBOSE) {
    console.log('[buildRingSubstituentAlkylName] chainLength:', chainLength, 'chainName:', chainName);
  }
  
  // Determine the position of that carbon in the chain
  // If it's the alkoxyStartAtomId, it's position 1
  // Otherwise we need to find its position
  let chainPositionOnRing = 1;
  if (chainCarbonAttachedToRing === alkoxyStartAtomId) {
    chainPositionOnRing = 1;
  } else {
    // For now, assume simple case where position correlates with distance from start
    // This would need BFS to find the actual position for complex branched chains
    chainPositionOnRing = chainLength; // fallback
  }
  
  if (process.env.VERBOSE) {
    console.log('[buildRingSubstituentAlkylName] chainPositionOnRing:', chainPositionOnRing);
    console.log('[buildRingSubstituentAlkylName] ringSubInfo.fullName:', ringSubInfo.fullName);
    console.log('[buildRingSubstituentAlkylName] result:', `${chainPositionOnRing}-(${ringSubInfo.fullName})${chainName}yl`);
  }
  
  return `${chainPositionOnRing}-(${ringSubInfo.fullName})${chainName}yl`;
}
