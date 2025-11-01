import type { IUPACRule } from '../types';
import { ExecutionPhase } from '../immutable-context';
import type { ImmutableNamingContext } from '../immutable-context';
import type { FunctionalGroup } from '../types';

/**
 * Name Assembly Layer Rules
 * 
 * This layer assembles the final IUPAC name from all the processed
 * information, following Blue Book rules for name construction.
 * 
 * Reference: Blue Book - Name construction and assembly rules
 * https://iupac.qmul.ac.uk/BlueBook/
 */

/**
 * Rule: Substituent Alphabetization
 * 
 * Arrange substituents in alphabetical order according to Blue Book rules.
 */
export const SUBSTITUENT_ALPHABETIZATION_RULE: IUPACRule = {
  id: 'substituent-alphabetization',
  name: 'Substituent Alphabetization',
  description: 'Arrange substituents in alphabetical order',
  blueBookReference: 'P-14.3 - Alphabetization of substituents',
  priority: 100,
  conditions: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState().functionalGroups as FunctionalGroup[];
    return functionalGroups && functionalGroups.length > 0;
  },
  action: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState().functionalGroups as FunctionalGroup[];
    
    if (!functionalGroups || functionalGroups.length === 0) {
      return context;
    }
    
    // Separate principal groups from substituents
  const principalGroups = functionalGroups.filter((group: FunctionalGroup) => group.isPrincipal);
  const substituentGroups = functionalGroups.filter((group: FunctionalGroup) => !group.isPrincipal);
    
    // Alphabetize substituents
    const alphabetizedSubstituents = substituentGroups.sort((a: FunctionalGroup, b: FunctionalGroup) => {
      const prefixA = a.prefix || a.type;
      const prefixB = b.prefix || b.type;
      return prefixA.localeCompare(prefixB);
    });
    
    return context.withStateUpdate(
        (state: any) => ({
        ...state,
        functionalGroups: [...principalGroups, ...alphabetizedSubstituents]
      }),
      'substituent-alphabetization',
      'Substituent Alphabetization',
      'P-14.3',
      ExecutionPhase.ASSEMBLY,
      `Alphabetized ${alphabetizedSubstituents.length} substituent(s)`
    );
  }
};

/**
 * Rule: Locant Assignment Assembly
 * 
 * Combine locants with their corresponding substituents/groups.
 */
export const LOCANT_ASSIGNMENT_ASSEMBLY_RULE: IUPACRule = {
  id: 'locant-assembly',
  name: 'Locant Assignment Assembly',
  description: 'Combine locants with substituents and functional groups',
  blueBookReference: 'P-14 - Locant assignment assembly',
  priority: 95,
  conditions: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState().functionalGroups as FunctionalGroup[];
    return functionalGroups && functionalGroups.length > 0;
  },
  action: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState().functionalGroups as FunctionalGroup[];
    const parentStructure = context.getState().parentStructure;
    
    if (!functionalGroups || !parentStructure) {
      return context;
    }
    
    // Build named groups with locants
    const assembledGroups = functionalGroups.map((group: FunctionalGroup) => {
      const locants = group.locants && group.locants.length > 0 
        ? group.locants.sort((a: number, b: number) => a - b).join(',')
        : '';
      
      const prefix = group.prefix || '';
      const suffix = group.suffix || '';
      const type = group.type;
      
      let name = '';
      // For alkoxy groups, the prefix IS the full substituent name (e.g., 'methoxy')
      // So we don't append the type 'alkoxy'
      if (type === 'alkoxy' && prefix) {
        name = locants ? `${locants}-${prefix}` : prefix;
      } else {
        if (locants) {
          name = `${locants}-${prefix}${type}${suffix}`;
        } else {
          name = `${prefix}${type}${suffix}`;
        }
      }
      
      return {
        ...group,
        assembledName: name,
        locantString: locants
      };
    });
    
    return context.withStateUpdate(
          (state: any) => ({
        ...state,
        functionalGroups: assembledGroups
      }),
      'locant-assembly',
      'Locant Assignment Assembly',
      'P-14',
      ExecutionPhase.ASSEMBLY,
      `Assembled names for ${assembledGroups.length} group(s)`
    );
  }
};

/**
 * Rule: Multiplicative Prefixes
 * 
 * Apply multiplicative prefixes (di-, tri-, tetra-, etc.) for identical groups.
 */
export const MULTIPLICATIVE_PREFIXES_RULE: IUPACRule = {
  id: 'multiplicative-prefixes',
  name: 'Multiplicative Prefixes',
  description: 'Apply multiplicative prefixes for identical groups',
  blueBookReference: 'P-16.1 - Multiplicative prefixes',
  priority: 90,
  conditions: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState().functionalGroups as FunctionalGroup[];
    if (!functionalGroups || functionalGroups.length === 0) return false;
    
    // Check for duplicate group types
    const groupTypes = functionalGroups.map(group => group.type);
    return groupTypes.some(type => 
      groupTypes.filter(t => t === type).length > 1
    );
  },
  action: (context) => {
    const functionalGroups = context.getState().functionalGroups;
    
    if (!functionalGroups) {
      return context;
    }
    
    // Group identical types
    const groupedTypes = new Map<string, FunctionalGroup[]>();
    functionalGroups.forEach((group: FunctionalGroup) => {
      const type = group.type;
      if (!groupedTypes.has(type)) {
        groupedTypes.set(type, []);
      }
      groupedTypes.get(type)!.push(group);
    });
    
    // Apply multiplicative prefixes
    const processedGroups: any[] = [];
    
    for (const [type, groups] of groupedTypes.entries()) {
      if (groups.length > 1) {
        // Multiple identical groups - apply prefix
        const count = groups.length;
        const prefix = getMultiplicativePrefix(count);
  const baseName = (groups[0]?.assembledName) || type;
        
        // Remove individual locants and apply multiplicative prefix
        const cleanName = baseName.replace(/^\d+,?-/, ''); // Remove leading locants
        const finalName = `${prefix}${cleanName}`;
        
        processedGroups.push({
          ...groups[0],
          assembledName: finalName,
          isMultiplicative: true,
          multiplicity: count,
          locantString: groups.map((g: any) => g.locantString).filter(Boolean).join(',')
        });
      } else {
        // Single group - keep as is
        processedGroups.push(groups[0]);
      }
    }
    
    return context.withStateUpdate(
      (state: any) => ({
        ...state,
        functionalGroups: processedGroups
      }),
      'multiplicative-prefixes',
      'Multiplicative Prefixes',
      'P-16.1',
      ExecutionPhase.ASSEMBLY,
      `Applied multiplicative prefixes to ${groupedTypes.size} group type(s)`
    );
  }
};

/**
 * Rule: Parent Structure Name Assembly
 * 
 * Build the complete parent structure name with appropriate suffixes.
 */
export const PARENT_NAME_ASSEMBLY_RULE: IUPACRule = {
  id: 'parent-name-assembly',
  name: 'Parent Structure Name Assembly',
  description: 'Build complete parent structure name',
  blueBookReference: 'P-2 - Parent structure names',
  priority: 50,
  conditions: (context) => {
    const parentStructure = context.getState().parentStructure;
    return parentStructure !== undefined;
  },
  action: (context) => {
    const parentStructure = context.getState().parentStructure;
    const functionalGroups = context.getState().functionalGroups;
    
    if (!parentStructure) {
      return context;
    }
    
    let parentName = '';
    

    if (parentStructure.type === 'chain') {
      parentName = buildChainName(parentStructure, functionalGroups);
    } else if (parentStructure.type === 'ring') {
      parentName = buildRingName(parentStructure, functionalGroups);
    } else if (parentStructure.type === 'heteroatom') {
      parentName = buildHeteroatomName(parentStructure, functionalGroups);
    } else {
      parentName = parentStructure.name || 'unknown';
    }
    
    return context.withStateUpdate(
      (state: any) => ({
        ...state,
        parentStructure: {
          ...parentStructure,
          assembledName: parentName
        }
      }),
      'parent-name-assembly',
      'Parent Structure Name Assembly',
      'P-2',
      ExecutionPhase.ASSEMBLY,
      `Assembled parent name: ${parentName}`
    );
  }
};

/**
 * Rule: Complete Name Assembly
 * 
 * Assemble the final IUPAC name from all components.
 */
export const COMPLETE_NAME_ASSEMBLY_RULE: IUPACRule = {
  id: 'complete-name-assembly',
  name: 'Complete Name Assembly',
  description: 'Assemble the final IUPAC name from all components',
  blueBookReference: 'Complete name construction',
  priority: 80,
  conditions: (context) => {
    const parentStructure = context.getState().parentStructure;
    return parentStructure !== undefined;
  },
  action: (context) => {
    const parentStructure = context.getState().parentStructure;
    const functionalGroups = context.getState().functionalGroups;
    const nomenclatureMethod = context.getState().nomenclatureMethod;
    
    if (!parentStructure) {
      return context.withConflict(
        {
          ruleId: 'complete-name-assembly',
          conflictType: 'state_inconsistency',
          description: 'No parent structure available for name assembly',
          context: {}
        },
        'complete-name-assembly',
        'Complete Name Assembly',
        'Complete construction',
        ExecutionPhase.ASSEMBLY,
        'No parent structure available for name assembly'
      );
    }
    
    // Build final name based on nomenclature method
    let finalName = '';
    
    if (nomenclatureMethod === 'functional_class') {
      finalName = buildFunctionalClassName(parentStructure, functionalGroups);
    } else {
      finalName = buildSubstitutiveName(parentStructure, functionalGroups);
    }
    
    return context.withStateUpdate(
      (state: any) => ({
        ...state,
        finalName: finalName,
        nameAssemblyComplete: true
      }),
      'complete-name-assembly',
      'Complete Name Assembly',
      'Complete construction',
      ExecutionPhase.ASSEMBLY,
      `Final name assembled: ${finalName}`
    );
  }
};

/**
 * Rule: Name Validation and Finalization
 * 
 * Validate the complete name and make final adjustments.
 */
export const NAME_VALIDATION_RULE: IUPACRule = {
  id: 'name-validation',
  name: 'Name Validation and Finalization',
  description: 'Validate and finalize the IUPAC name',
  blueBookReference: 'Complete name validation',
  priority: 70,
  conditions: (context) => {
    const finalName = context.getState().finalName;
    return !!finalName && finalName.length > 0;
  },
  action: (context) => {
    const finalName = context.getState().finalName;
    const parentStructure = context.getState().parentStructure;
    
    if (!finalName) {
      return context.withConflict(
        {
          ruleId: 'name-validation',
          conflictType: 'state_inconsistency',
          description: 'No final name available for validation',
          context: {}
        },
        'name-validation',
        'Name Validation and Finalization',
        'Validation',
        ExecutionPhase.ASSEMBLY,
        'No final name available for validation'
      );
    }
    
    // Validate name structure
    const validationResult = validateIUPACName(finalName, parentStructure);
    
    // Apply final formatting
    const formattedName = applyFinalFormatting(finalName);
    
    // Calculate confidence based on completeness
    const confidence = calculateNameConfidence(context.getState());
    
    return context.withStateUpdate(
        (state: any) => ({
        ...state,
        finalName: formattedName,
        nameValidation: validationResult,
        confidence: confidence
      }),
      'name-validation',
      'Name Validation and Finalization',
      'Validation',
      ExecutionPhase.ASSEMBLY,
      `Name validated and formatted: ${formattedName}`
    );
  }
};

/**
 * Rule: Name Assembly Complete
 * 
 * Final rule to mark the assembly phase as complete.
 */
export const NAME_ASSEMBLY_COMPLETE_RULE: IUPACRule = {
  id: 'name-assembly-complete',
  name: 'Name Assembly Complete',
  description: 'Mark the name assembly phase as complete',
  blueBookReference: 'Assembly phase completion',
  priority: 50,
  conditions: (context) => {
    const finalName = context.getState().finalName;
    return !!finalName && finalName.length > 0;
  },
  action: (context) => {
    const finalName = context.getState().finalName;
    
    if (!finalName) {
      return context.withConflict(
        {
          ruleId: 'name-assembly-complete',
          conflictType: 'state_inconsistency',
          description: 'No final name available for completion',
          context: {}
        },
        'name-assembly-complete',
        'Name Assembly Complete',
        'Assembly',
        ExecutionPhase.ASSEMBLY,
        'No final name available for completion'
      );
    }
    
    return context.withPhaseCompletion(
      ExecutionPhase.ASSEMBLY,
      'name-assembly-complete',
      'Name Assembly Complete',
      'Assembly',
      ExecutionPhase.ASSEMBLY,
      `Name assembly phase completed successfully: ${finalName}`
    );
  }
};

/**
 * Helper functions for name assembly
 */

function buildChainName(parentStructure: any, functionalGroups: any[]): string {
  const chain = parentStructure.chain;
  if (!chain) {
    return parentStructure.name || 'unknown-chain';
  }

   const length = chain.length;

   // Base chain name
  const chainNames = [
    '', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec',
    'undec', 'dodec', 'tridec', 'tetradec', 'pentadec', 'hexadec', 'heptadec', 'octadec', 'nonadec'
  ];
  
  let baseName = 'unknown';
  if (length < chainNames.length) {
    baseName = chainNames[length] ?? 'unknown';
  } else {
    baseName = `tetracos`; // For very long chains
  }
  
  // Add unsaturation suffixes based on multiple bonds
   const doubleBonds = chain.multipleBonds?.filter((bond: any) => bond.type === 'double') || [];
   const tripleBonds = chain.multipleBonds?.filter((bond: any) => bond.type === 'triple') || [];

   if (tripleBonds.length > 0 && doubleBonds.length === 0) {
     baseName = baseName.replace(/[aeiou]+$/, ''); // Remove trailing vowels
     const locants = tripleBonds.map((bond: any) => bond.locant).filter(Boolean).sort((a: number, b: number) => a - b);
     const needsLocant = tripleBonds.length > 1 || (locants.length === 1 && locants[0] !== 1);
     const locantStr = needsLocant ? `-${locants.join(',')}-` : '';
     baseName = `${baseName}${locantStr}yne`;
   } else if (doubleBonds.length > 0 && tripleBonds.length === 0) {
     baseName = baseName.replace(/[aeiou]+$/, ''); // Remove trailing vowels
     const locants = doubleBonds.map((bond: any) => bond.locant).filter(Boolean).sort((a: number, b: number) => a - b);
     const needsLocant = doubleBonds.length > 1 || (locants.length === 1 && locants[0] !== 1);
     const locantStr = needsLocant ? `-${locants.join(',')}-` : '';
     baseName = `${baseName}${locantStr}ene`;
   } else if (doubleBonds.length > 0 && tripleBonds.length > 0) {
     baseName = baseName.replace(/[aeiou]+$/, ''); // Remove trailing vowels
     const doubleLocants = doubleBonds.map((bond: any) => bond.locant).filter(Boolean).sort((a: number, b: number) => a - b);
     const tripleLocants = tripleBonds.map((bond: any) => bond.locant).filter(Boolean).sort((a: number, b: number) => a - b);
     const allLocants = [...doubleLocants, ...tripleLocants].sort((a: number, b: number) => a - b);
     const locantStr = allLocants.length > 0 ? `-${allLocants.join(',')}-` : '';
     baseName = `${baseName}${locantStr}en-yne`;
   } else {
     baseName += 'ane'; // Saturated
   }
  
  return baseName;
}

function buildRingName(parentStructure: any, functionalGroups: any[]): string {
  const ring = parentStructure.ring;
  if (!ring) {
    return parentStructure.name || 'unknown-ring';
  }

  // This is simplified - real implementation would use comprehensive ring naming
  const ringNames: { [key: number]: string } = {
    3: 'cyclopropane', 4: 'cyclobutane', 5: 'cyclopentane',
    6: 'cyclohexane', 7: 'cycloheptane', 8: 'cyclooctane'
  };

  const size = ring.size || (ring.atoms ? ring.atoms.length : 0);
  const baseName = ringNames[size] || `cyclo${size - 1}ane`;
  
  // If substituents are present on the ring, build a substituted ring name
  const subs = parentStructure.substituents || ring.substituents || [];
  if (subs && subs.length > 0) {
    // Group substituents by name and collect their locants
    const substituentGroups = new Map<string, number[]>();
    for (const sub of subs) {
      const subName = sub.name || sub.type;
      if (subName) {
        if (!substituentGroups.has(subName)) {
          substituentGroups.set(subName, []);
        }
        // Get locant from substituent
        const locant = sub.locant || sub.position;
        if (locant) {
          substituentGroups.get(subName)!.push(locant);
        }
      }
    }

    // Build substituent names with locants and multiplicative prefixes
    const substituentParts: string[] = [];
      for (const [subName, locants] of substituentGroups.entries()) {
        locants.sort((a, b) => a - b);
        // For single substituent at position 1, omit locant for cyclohexane
        const needsLocant = !(locants.length === 1 && locants[0] === 1 && size === 6 && subName === 'methyl');
        const locantStr = needsLocant ? locants.join(',') + '-' : '';
        
        // Add multiplicative prefix if there are multiple identical substituents
        const multiplicativePrefix = locants.length > 1 ? getMultiplicativePrefix(locants.length) : '';
        const fullSubName = `${locantStr}${multiplicativePrefix}${subName}`;
        substituentParts.push(fullSubName);
      }

    // Sort alphabetically by substituent name
    substituentParts.sort((a, b) => {
      const aName = a.split('-').slice(1).join('-');
      const bName = b.split('-').slice(1).join('-');
      return aName.localeCompare(bName);
    });

    const substituentPrefix = substituentParts.join('');
    if (ring.type === 'aromatic' && size === 6) {
      return substituentPrefix ? `${substituentPrefix}-benzene` : 'benzene';
    }
    return substituentPrefix ? `${substituentPrefix}${baseName}` : baseName;
  }

  // Check for aromatic naming
  if (ring.type === 'aromatic' && size === 6) {
    return 'benzene';
  }

  return baseName;
}

function buildHeteroatomName(parentStructure: any, functionalGroups: any[]): string {
  const heteroatom = parentStructure.heteroatom;
  if (!heteroatom) {
    return parentStructure.name || 'unknown-heteroatom';
  }

  // For simple heteroatom hydrides, just return the parent hydride name
  // Substituents would be handled by prefix addition in substitutive nomenclature
  return parentStructure.name || 'unknown-heteroatom';
}

function buildFunctionalClassName(parentStructure: any, functionalGroups: any[]): string {
  // Functional class nomenclature: substituent name + parent name + functional class term
  const functionalGroup = functionalGroups.find(group => group.type === 'ester' || group.type === 'amide');
  
  if (!functionalGroup) {
    return buildSubstitutiveName(parentStructure, functionalGroups);
  }
  
  // Simplified functional class naming
  switch (functionalGroup.type) {
    case 'ester':
      return `alkyl ${functionalGroup.assembledName || 'carboxylate'}`;
    case 'amide':
      return `${functionalGroup.assembledName || 'amide'}`;
    default:
      return buildSubstitutiveName(parentStructure, functionalGroups);
  }
}

function buildSubstitutiveName(parentStructure: any, functionalGroups: any[]): string {
  if (process.env.VERBOSE) {
    console.log('[buildSubstitutiveName] parentStructure.type:', parentStructure.type);
    console.log('[buildSubstitutiveName] parentStructure.substituents:', JSON.stringify(parentStructure.substituents?.map((s: any) => ({ type: s.type, locant: s.locant }))));
    console.log('[buildSubstitutiveName] functionalGroups:', JSON.stringify(functionalGroups.map(g => ({ type: g.type, atoms: g.atoms, isPrincipal: g.isPrincipal, prefix: g.prefix, suffix: g.suffix }))));
  }
  
  let name = '';

  // Add substituents from functional groups (excluding principal group)
  const fgSubstituents = functionalGroups.filter(group => !group.isPrincipal);
  
  // Find principal functional group atoms to exclude from substituents
  const principalFG = functionalGroups.find(group => group.isPrincipal);
  const principalGroupAtomIds = principalFG ? new Set(principalFG.atoms || []) : new Set();
  const principalFGPrefix = principalFG?.prefix; // e.g., "hydroxy" for alcohol
  
  if (process.env.VERBOSE) {
    console.log('[buildSubstitutiveName] principalGroupAtomIds:', Array.from(principalGroupAtomIds));
    console.log('[buildSubstitutiveName] principalFGPrefix:', principalFGPrefix);
  }
  
  // Collect all functional group atoms (both principal and non-principal)
  const allFGAtomIds = new Set<number>();
  for (const fg of functionalGroups) {
    if (fg.atoms) {
      for (const atom of fg.atoms) {
        allFGAtomIds.add(atom);
      }
    }
  }
  
  // For chain parent structures, use parent substituents if they exist
  // Only add functional groups that are NOT already represented in parent substituents
  // This prevents double-counting ethers that are already named as alkoxy substituents
  const parentSubstituents = (parentStructure.substituents || []).filter((sub: any) => {
    // Exclude if this substituent matches the principal functional group prefix
    // E.g., "hydroxy" substituent matches "alcohol" FG with prefix="hydroxy"
    if (principalFGPrefix && sub.type === principalFGPrefix) {
      if (process.env.VERBOSE) {
        console.log(`[buildSubstitutiveName] excluding substituent ${sub.type} (locant=${sub.locant}) - matches principal FG prefix`);
      }
      return false;
    }
    
    // Also check by atoms if available
    const subAtoms = sub.atoms || [];
    if (subAtoms.length > 0) {
      const isPrincipal = subAtoms.some((atom: any) => principalGroupAtomIds.has(atom.id));
      if (isPrincipal && process.env.VERBOSE) {
        console.log(`[buildSubstitutiveName] excluding substituent ${sub.type} - atoms overlap with principal FG`);
      }
      return !isPrincipal;
    }
    
    return true;
  });
  
  // Only add functional groups as substituents if parent structure has no substituents
  // OR if the functional group atoms are not already covered by parent substituents
  const fgToAdd = parentSubstituents.length > 0 ? [] : fgSubstituents;

  const allSubstituents = [...fgToAdd, ...parentSubstituents];

  if (process.env.VERBOSE) {
    console.log('[buildSubstitutiveName] fgSubstituents:', JSON.stringify(fgSubstituents.map(s => ({ type: s.type, name: s.name, locant: s.locant }))));
    console.log('[buildSubstitutiveName] parentSubstituents:', JSON.stringify(parentSubstituents.map((s: any) => ({ type: s.type, name: s.name, locant: s.locant }))));
    console.log('[buildSubstitutiveName] allSubstituents:', JSON.stringify(allSubstituents.map((s: any) => ({ type: s.type, name: s.name, locant: s.locant }))));
  }

  if (allSubstituents.length > 0) {
    // Build substituent names with locants and multiplicative prefixes
    const substituentParts: string[] = [];
    const size = parentStructure.type === 'ring' ? (parentStructure.size || 0) : 0;
    const isHeteroatomParent = parentStructure.type === 'heteroatom';

    if (isHeteroatomParent) {
      // For heteroatom parents, group identical substituents and add multiplicative prefixes
      const groupedSubs = new Map<string, number>();
      for (const sub of allSubstituents) {
        // Skip functional groups that have suffix property - they will be handled as suffixes
        if (sub.suffix) continue;
        
        let subName = sub.assembledName || sub.name || sub.type;
        
        // Convert thioether to sulfanyl when used as substituent
        if (subName === 'thioether') {
          subName = 'sulfanyl';
        }
        
        if (subName) {
          groupedSubs.set(subName, (groupedSubs.get(subName) || 0) + 1);
        }
      }
      for (const [subName, count] of groupedSubs.entries()) {
        const prefix = count > 1 ? getMultiplicativePrefix(count) : '';
        substituentParts.push(`${prefix}${subName}`);
      }
      // Sort alphabetically
      substituentParts.sort();
    } else {
      // For chain/ring parents, group by name and add locants
      const substituentGroups = new Map<string, number[]>();
      for (const sub of allSubstituents) {
        // Skip functional groups that have suffix property - they will be handled as suffixes
        if (sub.suffix) continue;
        
        // For alkoxy groups, use the prefix (e.g., 'methoxy') instead of type ('alkoxy')
        let subName = sub.assembledName || sub.name || (sub.type === 'alkoxy' ? sub.prefix : sub.type);
        
        // Convert thioether to sulfanyl when used as substituent
        // Handle both "thioether" and "3-thioether" (with locant prefix)
        if (subName === 'thioether' || subName.includes('-thioether')) {
          subName = subName.replace('thioether', 'sulfanyl');
        }
        
        if (subName) {
          // Check if assembledName already includes locants (e.g., "4-methoxy")
          const alreadyHasLocants = sub.assembledName && /^\d+-/.test(sub.assembledName);
          
          if (alreadyHasLocants) {
            // If assembledName already has locants, use it as-is without grouping
            substituentParts.push(subName);
          } else {
            // Otherwise, collect locants and group by name
            if (!substituentGroups.has(subName)) {
              substituentGroups.set(subName, []);
            }
            // Get locant from substituent
            const locant = sub.locant || sub.locants?.[0];
            if (locant) {
              substituentGroups.get(subName)!.push(locant);
            }
          }
        }
      }
      // Check if there are multiple substituent types or multiple positions
      const hasMultipleSubstituentTypes = substituentGroups.size > 1;
      const totalSubstituents = Array.from(substituentGroups.values()).reduce((sum, locs) => sum + locs.length, 0);
      
      for (const [subName, locants] of substituentGroups.entries()) {
        locants.sort((a, b) => a - b);
        // For single substituent at position 1 on symmetric rings, omit locant
        // This applies to benzene, cyclohexane, cyclopentane, and other symmetric rings
        // BUT only if it's the ONLY substituent on the ring
        const parentName = parentStructure.assembledName || parentStructure.name || '';
        const isSymmetricRing = parentName.includes('benzene') || parentName.includes('cyclo');
        const isSingleSubstituentOnly = locants.length === 1 && locants[0] === 1 && isSymmetricRing && totalSubstituents === 1;
        const needsLocant = !isSingleSubstituentOnly;
        const locantStr = needsLocant ? locants.join(',') + '-' : '';
        
        // Add multiplicative prefix if there are multiple identical substituents
        const multiplicativePrefix = locants.length > 1 ? getMultiplicativePrefix(locants.length) : '';
        
        // Check if substituent name contains internal locants (e.g., "2,2-dimethylpropoxy")
        // If so, wrap in parentheses per IUPAC rules
        const hasInternalLocants = /\d+,\d+/.test(subName);
        const wrappedSubName = hasInternalLocants ? `(${subName})` : subName;
        
        const fullSubName = `${locantStr}${multiplicativePrefix}${wrappedSubName}`;
        substituentParts.push(fullSubName);
      }
    }

    // Sort alphabetically by substituent name
    // Per IUPAC P-14.3: ignore multiplicative prefixes (di-, tri-, tetra-, etc.) when alphabetizing
    substituentParts.sort((a, b) => {
      // Extract name after locants: "2,2-dichloro" → "dichloro"
      const aName = a.split('-').slice(1).join('-');
      const bName = b.split('-').slice(1).join('-');
      
      // Strip multiplicative prefixes for comparison: "dichloro" → "chloro"
      const stripMultiplicativePrefix = (name: string): string => {
        const prefixes = ['di', 'tri', 'tetra', 'penta', 'hexa', 'hepta', 'octa', 'nona', 'deca'];
        for (const prefix of prefixes) {
          if (name.startsWith(prefix)) {
            return name.slice(prefix.length);
          }
        }
        return name;
      };
      
      const aBase = stripMultiplicativePrefix(aName);
      const bBase = stripMultiplicativePrefix(bName);
      
      return aBase.localeCompare(bBase);
    });
    
    // IUPAC hyphenation rules:
    // 1. If single substituent with no locant (e.g., "methyl"): join directly to parent → "methylcyclohexane"
    // 2. If single substituent with locant (e.g., "2-methyl"): already has hyphen, join directly → "2-methylcyclohexane"
    // 3. If multiple substituents: join with hyphens between them but NO hyphen before parent → "2,2-dichloro-1-methylcyclohexane"
    
    if (process.env.VERBOSE) {
      console.log('[DEBUG] substituentParts before join:', JSON.stringify(substituentParts));
    }
    
    if (substituentParts.length === 1) {
      // Single substituent - join directly (it may already have a locant with hyphen)
      name += substituentParts[0];
    } else if (substituentParts.length > 1) {
      // Multiple substituents - join with hyphens between them, but no hyphen before parent
      name += substituentParts.join('-');
    }
  }

  // Add parent structure
  if (process.env.VERBOSE) {
    console.log('[DEBUG] parentStructure.assembledName:', parentStructure.assembledName);
    console.log('[DEBUG] parentStructure.name:', parentStructure.name);
  }
  const parentName = parentStructure.assembledName || parentStructure.name || 'unknown';
  
  // If we have substituents and the parent name starts with a digit (locant), add hyphen
  // Example: "5-methoxy" + "2-hexyl-2-methylbutane" → "5-methoxy-2-hexyl-2-methylbutane"
  if (allSubstituents.length > 0 && name.length > 0 && /^\d/.test(parentName)) {
    name += '-';
  }
  
  name += parentName;

  // Add principal functional group suffix
  const principalGroup = functionalGroups.find(group => group.isPrincipal);
  if (process.env.VERBOSE) {
    console.log('[buildSubstitutiveName] principalGroup:', JSON.stringify(principalGroup));
  }
  if (principalGroup && principalGroup.suffix) {
    // Get locant for the principal functional group
    // Try to find it from parentStructure.substituents first
    // by matching the prefix (e.g., "hydroxy" for alcohol)
    let fgLocant: number | undefined;
    if (principalGroup.prefix && parentStructure.substituents) {
      const matchingSubstituent = parentStructure.substituents.find(
        (sub: any) => sub.type === principalGroup.prefix
      );
      if (matchingSubstituent) {
        fgLocant = matchingSubstituent.locant;
        if (process.env.VERBOSE) {
          console.log(`[buildSubstitutiveName] mapped principal FG locant from substituent: ${fgLocant}`);
        }
      }
    }
    
    // Fallback to locant/locants from the principal group if not found
    if (!fgLocant) {
      fgLocant = principalGroup.locant || principalGroup.locants?.[0];
      if (process.env.VERBOSE) {
        console.log('[buildSubstitutiveName] using fallback fgLocant:', fgLocant);
      }
    }
    
    // For cyclic and chain systems, we need to add the suffix with proper formatting
    // Example: cyclohexane + alcohol at C1 → cyclohexan-1-ol
    // Example: propane + alcohol at C2 → propan-2-ol
    
    // Replace ending with "an" for saturated systems, "en" for unsaturated
    if (/ane$/.test(name)) {
      name = name.replace(/ane$/, 'an');
    } else if (/ene$/.test(name)) {
      name = name.replace(/ene$/, 'en');
    } else if (/yne$/.test(name)) {
      name = name.replace(/yne$/, 'yn');
    }
    
    // Add locant if present and not position 1 on a chain/ring
    // For alcohols and other functional groups, we typically need the locant
    // unless it's unambiguous (like methanol)
    const parentName = parentStructure.assembledName || parentStructure.name || '';
    const chainLength = parentStructure.chain?.length || parentStructure.size || 0;
    const needsLocant = fgLocant && (fgLocant !== 1 || parentStructure.type === 'ring' || chainLength > 2);
    
    if (process.env.VERBOSE) {
      console.log(`[needsLocant calc] fgLocant=${fgLocant}, type=${parentStructure.type}, chainLength=${chainLength}, needsLocant=${needsLocant}`);
    }
    
    if (needsLocant && fgLocant) {
      name += `-${fgLocant}-${principalGroup.suffix}`;
    } else {
      name += principalGroup.suffix;
    }
  }

  return name;
}

function getMultiplicativePrefix(count: number): string {
  const prefixes: { [key: number]: string } = {
    2: 'di', 3: 'tri', 4: 'tetra', 5: 'penta', 6: 'hexa',
    7: 'hepta', 8: 'octa', 9: 'nona', 10: 'deca'
  };
  
  return prefixes[count] || `${count}-`;
}

function validateIUPACName(name: string, parentStructure: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Basic validation rules
  if (!name || name.trim().length === 0) {
    errors.push('Name is empty');
  }
  
  if (name.length > 200) {
    errors.push('Name is unusually long (>200 characters)');
  }
  
  // Check for basic naming patterns
  if (!/[a-zA-Z]/.test(name)) {
    errors.push('Name contains no letters');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

function applyFinalFormatting(name: string): string {
  // Apply final formatting rules
  let formatted = name.trim();
  
  // Remove multiple consecutive hyphens
  formatted = formatted.replace(/--+/g, '-');
  
  // Ensure proper spacing around locants
  formatted = formatted.replace(/(\d)-([a-zA-Z])/g, '$1-$2');
  
  // IUPAC names should be lowercase unless they start with a locant
  // Don't capitalize the first letter - IUPAC names are lowercase
  // Exception: If the name starts with a capital letter already (e.g., from a proper name), keep it
  formatted = formatted.charAt(0).toLowerCase() + formatted.slice(1);
  
  return formatted;
}

function calculateNameConfidence(state: any): number {
  let confidence = 1.0;
  
  // Reduce confidence if components are missing
  if (!state.parentStructure) confidence -= 0.3;
  if (!state.functionalGroups || state.functionalGroups.length === 0) confidence -= 0.1;
  
  // Reduce confidence if conflicts were detected
  if (state.conflicts && state.conflicts.length > 0) {
    confidence -= state.conflicts.length * 0.1;
  }
  
  // Reduce confidence if validation failed
  if (state.nameValidation && !state.nameValidation.isValid) {
    confidence -= 0.2;
  }
  
  return Math.max(0.1, Math.min(1.0, confidence));
}

/**
 * Export all name assembly layer rules
 */
export const NAME_ASSEMBLY_LAYER_RULES: IUPACRule[] = [
  SUBSTITUENT_ALPHABETIZATION_RULE,
  LOCANT_ASSIGNMENT_ASSEMBLY_RULE,
  MULTIPLICATIVE_PREFIXES_RULE,
  PARENT_NAME_ASSEMBLY_RULE,
  COMPLETE_NAME_ASSEMBLY_RULE,
  NAME_VALIDATION_RULE,
  NAME_ASSEMBLY_COMPLETE_RULE
];