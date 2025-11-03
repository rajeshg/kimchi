import type { Molecule } from '../../../types';

/**
 * Build N-substituted amide name
 * 
 * Example: CC(C)(C)C(C(=O)NC1=CC=CC=C1)ONC(C)(C)C
 * Should generate: N-phenylbutanamide (or with full prefix: 2-(tert-butylamino)oxy-3,3-dimethyl-N-phenylbutanamide)
 */
export function buildAmideName(
  parentStructure: any,
  functionalGroup: any,
  molecule: Molecule,
  functionalGroups: any[]
): string {
  if (process.env.VERBOSE) {
    console.log('[buildAmideName] parentStructure:', JSON.stringify(parentStructure, null, 2));
    console.log('[buildAmideName] functionalGroup:', functionalGroup);
    console.log('[buildAmideName] functionalGroup.atoms:', functionalGroup.atoms);
  }

  // Build base amide name from parent structure
  // For functional class nomenclature, build like: "butanamide", "pentanamide", etc.
  const chainLength = parentStructure.chain?.length || 0;
  const chainNames = [
    '', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec'
  ];
  let baseName = 'amide';
  if (chainLength > 0 && chainLength < chainNames.length) {
    const stem = chainNames[chainLength];
    baseName = `${stem}anamide`;
  }
  
  if (process.env.VERBOSE) {
    console.log('[buildAmideName] baseName:', baseName);
  }
  
  // Extract amide nitrogen from functional group atoms
  // Format: [carbonylC, oxygen, nitrogen]
  const nitrogenAtom = functionalGroup.atoms?.[2];
  
  if (!nitrogenAtom) {
    if (process.env.VERBOSE) {
      console.log('[buildAmideName] No nitrogen found in amide functional group');
    }
    return baseName;
  }
  
  const amideNitrogenId = nitrogenAtom.id;
  
  if (process.env.VERBOSE) {
    console.log('[buildAmideName] amideNitrogenId:', amideNitrogenId);
  }
  
  // Use the nitrogen atom directly
  const nitrogen = nitrogenAtom;
  if (!nitrogen) {
    return baseName;
  }
  
  // Find all neighbors of the nitrogen (excluding the carbonyl carbon)
  const carbonylCarbonId = functionalGroup.atoms?.[0];
  const nSubstituents: Array<{ atomId: number; name: string }> = [];
  
  for (const bond of molecule.bonds) {
    if (bond.type !== 'single') continue;
    
    let neighborId: number | undefined;
    if (bond.atom1 === amideNitrogenId && bond.atom2 !== carbonylCarbonId) {
      neighborId = bond.atom2;
    } else if (bond.atom2 === amideNitrogenId && bond.atom1 !== carbonylCarbonId) {
      neighborId = bond.atom1;
    }
    
    if (neighborId === undefined) continue;
    
    const neighbor = molecule.atoms[neighborId];
    if (!neighbor) continue;
    
    if (process.env.VERBOSE) {
      console.log(`[buildAmideName] Found N-neighbor: atom ${neighborId}, symbol ${neighbor.symbol}, aromatic ${neighbor.aromatic}`);
    }
    
    // Check if neighbor is aromatic carbon (likely phenyl ring)
    if (neighbor.aromatic && neighbor.symbol === 'C') {
      // Find the aromatic ring name
      const ringName = getAromaticRingName(neighborId, molecule);
      nSubstituents.push({ atomId: neighborId, name: ringName });
      if (process.env.VERBOSE) {
        console.log(`[buildAmideName] Added aromatic substituent: ${ringName}`);
      }
    }
    // Check for other substituents (alkyl groups, etc.)
    else if (neighbor.symbol === 'C' || neighbor.symbol === 'H') {
      // For now, skip non-aromatic substituents
      // TODO: Handle alkyl substituents like N-methyl, N-ethyl, etc.
      if (process.env.VERBOSE) {
        console.log(`[buildAmideName] Skipping non-aromatic carbon substituent at ${neighborId}`);
      }
    }
  }
  
  // Build final name with N-substituents and carbon chain substituents
  
  // Get carbon chain substituents from parent structure
  const chainSubstituents = parentStructure.substituents || [];
  
  // Group identical substituents by locant
  const groupedSubstituents = new Map<string, { locants: number[], name: string }>();
  for (const sub of chainSubstituents) {
    const key = sub.type || 'substituent';
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
  
  // Sort substituent parts alphabetically
  substituentParts.sort();
  
  // Build N-prefixes
  const nPrefixes = nSubstituents
    .map(sub => `N-${sub.name}`)
    .sort()
    .join('-');
  
  // Combine: substituents + N-substituents + base name
  // Example: 2-(tert-butylamino)oxy-3,3-dimethyl-N-phenylbutanamide
  let finalName = '';
  if (substituentParts.length > 0) {
    finalName = substituentParts.join('-') + '-';
  }
  if (nPrefixes) {
    finalName += nPrefixes;
  }
  finalName += baseName;
  
  if (process.env.VERBOSE) {
    console.log('[buildAmideName] chainSubstituents:', chainSubstituents);
    console.log('[buildAmideName] substituentParts:', substituentParts);
    console.log('[buildAmideName] nPrefixes:', nPrefixes);
    console.log('[buildAmideName] Final name:', finalName);
  }
  
  return finalName;
}

function getMultiplier(count: number): string {
  const multipliers = ['', '', 'di', 'tri', 'tetra', 'penta', 'hexa', 'hepta', 'octa', 'nona', 'deca'];
  return count < multipliers.length ? (multipliers[count] || '') : `${count}-`;
}

/**
 * Get the name of an aromatic ring (e.g., "phenyl")
 */
function getAromaticRingName(startAtomId: number, molecule: Molecule): string {
  // Find the aromatic ring containing this atom
  const atom = molecule.atoms[startAtomId];
  if (!atom) return 'aryl';
  
  // Check if it's part of a 6-membered aromatic ring (benzene/phenyl)
  if (atom.ringIds && atom.ringIds.length > 0) {
    for (const ringId of atom.ringIds) {
      const ring = molecule.rings?.[ringId];
      if (!ring) continue;
      
      const ringAtoms = ring.map(atomId => molecule.atoms[atomId]);
      const allAromatic = ringAtoms.every(a => a?.aromatic);
      const allCarbon = ringAtoms.every(a => a?.symbol === 'C');
      
      if (allAromatic && allCarbon && ring.length === 6) {
        return 'phenyl';
      }
      
      // Handle other aromatic rings (pyridine, etc.)
      if (allAromatic && ring.length === 6) {
        const hasNitrogen = ringAtoms.some(a => a?.symbol === 'N');
        if (hasNitrogen) {
          return 'pyridyl';
        }
      }
    }
  }
  
  // Default to generic aryl
  return 'aryl';
}
