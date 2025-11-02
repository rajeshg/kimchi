import type { IUPACRule } from '../types';
import { ExecutionPhase } from '../immutable-context';
import type { ImmutableNamingContext } from '../immutable-context';
import type { FunctionalGroup } from '../types';
import {
  buildEsterWithRingAlkylGroup,
  buildEsterWithRingAcylGroup,
  buildEsterName,
  buildDiesterName,
  getAlkoxyGroupName
} from '../utils/ester-naming';

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
      
      if (process.env.VERBOSE) {
        console.log(`[LOCANT_ASSEMBLY] Processing group: type=${group.type}, prefix=${group.prefix}, locants array=${JSON.stringify(group.locants)}, locants string=${locants}`);
      }
      
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
    
    // Group identical types (only consider principal groups for multiplicative prefixes)
    const groupedTypes = new Map<string, FunctionalGroup[]>();
    functionalGroups.forEach((group: FunctionalGroup) => {
      // Only apply multiplicative prefixes to principal groups
      // Non-principal groups should be treated as substituents
      if (!group.isPrincipal) {
        return;
      }
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
          locantString: groups
            .map((g: any) => g.locants?.[0] || -1)
            .filter(l => l > 0)
            .sort((a, b) => a - b)
            .join(',')
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
    const molecule = context.getState().molecule;
    
    if (process.env.VERBOSE) {
      console.log('[COMPLETE_NAME_ASSEMBLY_RULE] nomenclatureMethod:', nomenclatureMethod);
      console.log('[COMPLETE_NAME_ASSEMBLY_RULE] parentStructure:', parentStructure?.type);
      console.log('[COMPLETE_NAME_ASSEMBLY_RULE] functionalGroups:', functionalGroups?.map(g => g.type));
    }
    
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
      if (process.env.VERBOSE) console.log('[COMPLETE_NAME_ASSEMBLY_RULE] Building functional class name');
      finalName = buildFunctionalClassName(parentStructure, functionalGroups, molecule);
    } else {
      if (process.env.VERBOSE) console.log('[COMPLETE_NAME_ASSEMBLY_RULE] Building substitutive name');
      finalName = buildSubstitutiveName(parentStructure, functionalGroups);
    }
    
    if (process.env.VERBOSE) console.log('[COMPLETE_NAME_ASSEMBLY_RULE] finalName:', finalName);
    
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
     // IUPAC rule: Omit locant when unambiguous (chains ≤3 carbons have only one possible position)
     // Include locant for chains ≥4 carbons where position matters (but-1-yne vs but-2-yne)
     const locantStr = (locants.length > 0 && length >= 4) ? `-${locants.join(',')}-` : '';
     baseName = `${baseName}${locantStr}yne`;
   } else if (doubleBonds.length > 0 && tripleBonds.length === 0) {
     baseName = baseName.replace(/[aeiou]+$/, ''); // Remove trailing vowels
     const allLocants = doubleBonds.map((bond: any) => bond.locant);
     const locants = allLocants.filter((loc: any) => loc !== undefined && loc !== null).sort((a: number, b: number) => a - b);
     // IUPAC rule: Omit locant when unambiguous (chains ≤3 carbons have only one possible position)
     // Include locant for chains ≥4 carbons where position matters (but-1-ene vs but-2-ene)
     const locantStr = (locants.length > 0 && length >= 4) ? `-${locants.join(',')}-` : '';
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

function buildFunctionalClassName(parentStructure: any, functionalGroups: any[], molecule: any): string {
  // Functional class nomenclature: substituent name + parent name + functional class term
  const functionalGroup = functionalGroups.find(group => 
    group.type === 'ester' || group.type === 'amide' || group.type === 'thiocyanate'
  );
  
  if (process.env.VERBOSE) {
    console.log('[buildFunctionalClassName] functionalGroup:', functionalGroup);
  }
  
  if (!functionalGroup) {
    return buildSubstitutiveName(parentStructure, functionalGroups);
  }
  
  // Functional class naming
  switch (functionalGroup.type) {
    case 'ester':
      return buildEsterName(parentStructure, functionalGroup, molecule, functionalGroups);
    case 'amide':
      return `${functionalGroup.assembledName || 'amide'}`;
    case 'thiocyanate':
      return buildThiocyanateName(parentStructure, functionalGroups);
    default:
      return buildSubstitutiveName(parentStructure, functionalGroups);
  }
}

function buildThiocyanateName(parentStructure: any, functionalGroups: any[]): string {
  // Thiocyanate functional class nomenclature: [alkyl]thiocyanate
  // Example: CC(=O)CCSC#N → 3-oxobutylthiocyanate
  
  if (process.env.VERBOSE) {
    console.log('[buildThiocyanateName] functionalGroups:', functionalGroups.map((g: any) => ({ type: g.type, atoms: g.atoms })));
  }
  
  // Get all functional groups except the thiocyanate
  const otherGroups = functionalGroups.filter(group => group.type !== 'thiocyanate');
  
  if (process.env.VERBOSE) {
    console.log('[buildThiocyanateName] otherGroups:', otherGroups.map((g: any) => ({ type: g.type, atoms: g.atoms })));
  }
  
  // Build the alkyl portion name from parent structure + other substituents
  const alkylName = buildAlkylGroupName(parentStructure, otherGroups);
  
  if (process.env.VERBOSE) {
    console.log('[buildThiocyanateName] alkylName:', alkylName);
  }
  
  // Add "thiocyanate" at the end with space (functional class nomenclature)
  return `${alkylName} thiocyanate`;
}

function buildAlkylGroupName(parentStructure: any, functionalGroups: any[]): string {
  // Build alkyl group name (like "3-oxobutyl")
  // This is similar to buildSubstitutiveName but ends with "yl" instead of "ane"
  
  if (process.env.VERBOSE) {
    console.log('[buildAlkylGroupName] parentStructure.chain:', parentStructure.chain?.atoms?.map((a: any) => a.id));
    console.log('[buildAlkylGroupName] functionalGroups:', functionalGroups.map((g: any) => ({ type: g.type, locants: g.locants, atoms: g.atoms })));
  }
  
  // For functional class nomenclature with thiocyanate:
  // The chain needs to be renumbered from the attachment point (where thiocyanate was attached)
  // The attachment point is the first atom in the chain (lowest locant becomes 1)
  
  let name = '';
  
  // Add substituents from functional groups
  // For functional class nomenclature, ALL functional groups (except thiocyanate) become substituents
  const fgSubstituents = functionalGroups; // Don't filter by isPrincipal - include all
  const parentSubstituents = parentStructure.substituents || [];
  
  // Filter out thiocyanate substituents from parent
  const filteredParentSubstituents = parentSubstituents.filter((sub: any) => 
    sub.type !== 'thiocyanate' && sub.type !== 'thiocyano' && sub.name !== 'thiocyano'
  );
  
  // Renumber functional groups based on chain position
  const chain = parentStructure.chain;
  const chainAtomIds = chain?.atoms?.map((a: any) => a.id) || [];
  
  // Create a map from atom ID to new locant (1-indexed from start of chain)
  const atomIdToLocant = new Map<number, number>();
  chainAtomIds.forEach((atomId: number, index: number) => {
    atomIdToLocant.set(atomId, index + 1);
  });
  
  if (process.env.VERBOSE) {
    console.log('[buildAlkylGroupName] atomIdToLocant:', Array.from(atomIdToLocant.entries()));
  }
  
  // Renumber functional groups
  const renumberedFgSubstituents = fgSubstituents.map(group => {
    if (group.atoms && group.atoms.length > 0) {
      // For ketone, the carbon of C=O is the position
      const carbonAtomId = group.atoms[0]; // First atom is typically the C in C=O
      const newLocant = atomIdToLocant.get(carbonAtomId);
      if (newLocant) {
        return { ...group, locants: [newLocant], locant: newLocant };
      }
    }
    return group;
  });
  
  const allSubstituents = [...renumberedFgSubstituents, ...filteredParentSubstituents];
  
  if (process.env.VERBOSE) {
    console.log('[buildAlkylGroupName] renumberedFgSubstituents:', renumberedFgSubstituents.map((s: any) => ({ type: s.type, locants: s.locants })));
    console.log('[buildAlkylGroupName] allSubstituents:', allSubstituents.map((s: any) => ({ type: s.type, name: s.name, locant: s.locant, locants: s.locants })));
  }
  
  if (allSubstituents.length > 0) {
    const substituentParts: string[] = [];
    const substituentGroups = new Map<string, number[]>();
    
    for (const sub of allSubstituents) {
      // For ketone groups, use "oxo" prefix
      let subName = sub.assembledName || sub.name || sub.prefix || sub.type;
      
      if (sub.type === '[CX3](=O)[CX4]' || sub.type === 'ketone') {
        subName = 'oxo';
      }
      
      if (subName) {
        if (!substituentGroups.has(subName)) {
          substituentGroups.set(subName, []);
        }
        const locant = sub.locant || sub.locants?.[0];
        if (locant) {
          substituentGroups.get(subName)!.push(locant);
        }
      }
    }
    
    for (const [subName, locants] of substituentGroups.entries()) {
      locants.sort((a, b) => a - b);
      const locantStr = locants.length > 0 ? locants.join(',') + '-' : '';
      const multiplicativePrefix = locants.length > 1 ? getMultiplicativePrefix(locants.length) : '';
      const fullSubName = `${locantStr}${multiplicativePrefix}${subName}`;
      substituentParts.push(fullSubName);
    }
    
    substituentParts.sort((a, b) => {
      const aName = a.split('-').slice(1).join('-');
      const bName = b.split('-').slice(1).join('-');
      return aName.localeCompare(bName);
    });
    
    if (substituentParts.length > 0) {
      // Join substituent parts with commas if multiple, no trailing hyphen
      name += substituentParts.join(',');
    }
  }
  
  // Add parent chain name with "yl" ending (no hyphen between prefix and base)
  if (parentStructure.type === 'chain') {
    const chain = parentStructure.chain;
    const length = chain?.length || 0;
    
    const chainNames = [
      '', 'meth', 'eth', 'prop', 'but', 'pent', 'hex', 'hept', 'oct', 'non', 'dec'
    ];
    
    let baseName = 'alkyl';
    if (length < chainNames.length) {
      baseName = (chainNames[length] ?? 'alk') + 'yl';
    }
    
    name += baseName;
  } else {
    name += 'alkyl';
  }
  
  return name;
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
        
        if (process.env.VERBOSE) {
          console.log(`[SUBNAME DEBUG] sub.type=${sub.type}, sub.assembledName=${sub.assembledName}, sub.name=${sub.name}, sub.prefix=${sub.prefix}, final subName=${subName}`);
        }
        
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
            if (process.env.VERBOSE) {
              console.log(`[LOCANT DEBUG] sub.type=${sub.type}, sub.name=${sub.name}, sub.locant=${sub.locant}, sub.locants=${JSON.stringify(sub.locants)}, calculated locant=${locant}`);
            }
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
        
        // Check if substituent name contains internal locants (e.g., "2,2-dimethylpropoxy" or "2-methylbutan-2-yloxy")
        // Complex ether substituents like "2-methylbutan-2-yloxymethoxy" need parentheses or square brackets
        // Patterns to detect:
        // 1. Contains comma-separated digits: "2,2-dimethyl"
        // 2. Contains "\d+-\w+an-\d+-yl" pattern: "2-methylbutan-2-yl" (complex substituted yl group)
        // 3. Contains "oxy" AND internal digits: complex ether like "2-methylbutan-2-yloxymethoxy"
        // Note: Simple yl groups like "propan-2-yl" or "butan-2-yl" should NOT be wrapped
        const hasInternalLocants = /\d+,\d+/.test(subName) || // Pattern: 2,2-dimethyl
                                   /\d+-\w+an-\d+-yl/.test(subName) || // Pattern: 2-methylbutan-2-yl
                                   (subName.includes('oxy') && /\d+-\w+/.test(subName)); // Complex ether
        
        // Check if already wrapped in parentheses
        const alreadyWrapped = subName.startsWith('(') && subName.endsWith(')');
        
        // For nested complex ethers with parentheses in the tail part, use square brackets
        // Otherwise use parentheses for simple complex substituents
        const hasNestedParens = subName.includes('(') && subName.includes(')');
        const needsSquareBrackets = hasInternalLocants && hasNestedParens && !alreadyWrapped;
        
        if (process.env.VERBOSE && (subName.includes('methyl') || subName.includes('propyl'))) {
          console.log(`[WRAP DEBUG] subName="${subName}", hasInternalLocants=${hasInternalLocants}, alreadyWrapped=${alreadyWrapped}`);
        }
        
        const wrappedSubName = alreadyWrapped ? subName :
                              needsSquareBrackets ? `[${subName}]` : 
                              hasInternalLocants ? `(${subName})` : 
                              subName;
        
        const fullSubName = `${locantStr}${multiplicativePrefix}${wrappedSubName}`;
        substituentParts.push(fullSubName);
      }
    }

    // Sort alphabetically by substituent name
    // Per IUPAC P-14.3: ignore multiplicative prefixes (di-, tri-, tetra-, etc.) when alphabetizing
    substituentParts.sort((a, b) => {
      // Extract name after locants: "2,2-dichloro" → "dichloro" or "2-[1-(2-methylbutoxy)ethoxy]" → "[1-(2-methylbutoxy)ethoxy]"
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
      
      // Extract the principal substituent name for complex substituents for alphabetization
      // Per IUPAC P-14.4: For complex substituents, alphabetize by the first letter of the complex name
      // ignoring locants, multiplicative prefixes, and opening delimiters
      // Example: "[1-(2-methylbutoxy)ethoxy]" → alphabetize by first letter inside: "m" (from methylbutoxy)
      // Example: "bis(1,1-dimethylethyl)" → alphabetize by "d" (from dimethylethyl)
      const extractPrincipalName = (name: string): string => {
        let result = name;
        
        // Remove leading brackets/parentheses and locants recursively
        // "[1-(2-methylbutoxy)ethoxy]" → "1-(2-methylbutoxy)ethoxy" → "(2-methylbutoxy)ethoxy"
        while (true) {
          const before = result;
          
          // Remove leading brackets/parentheses
          if (result.startsWith('(') || result.startsWith('[')) {
            result = result.slice(1);
          }
          // Remove trailing brackets/parentheses
          if (result.endsWith(')') || result.endsWith(']')) {
            result = result.slice(0, -1);
          }
          // Remove leading locants (number followed by hyphen)
          result = result.replace(/^\d+-/, '');
          
          // If nothing changed, we're done
          if (result === before) break;
        }
        
        // Now for complex substituents with nested parentheses/brackets, 
        // we need to find the first alphabetic character
        // "(2-methylbutoxy)ethoxy" → look inside the first parenthetical → "methylbutoxy"
        if (result.startsWith('(') || result.startsWith('[')) {
          // Find the matching closing delimiter
          const openDelim = result[0];
          const closeDelim = openDelim === '(' ? ')' : ']';
          let depth = 1;
          let i = 1;
          while (i < result.length && depth > 0) {
            if (result[i] === openDelim) depth++;
            else if (result[i] === closeDelim) depth--;
            i++;
          }
          // Extract content inside the first parenthetical
          const insideFirst = result.substring(1, i - 1);
          // Recursively extract from inside, removing any locants
          result = extractPrincipalName(insideFirst);
        }
        
        return result;
      };
      
      let aBase = stripMultiplicativePrefix(aName);
      let bBase = stripMultiplicativePrefix(bName);
      
      // Extract principal names for alphabetization
      aBase = extractPrincipalName(aBase);
      bBase = extractPrincipalName(bBase);
      
      return aBase.localeCompare(bBase);
    });
    
    // IUPAC hyphenation rules:
    // 1. If single substituent with no locant (e.g., "methyl"): join directly to parent → "methylcyclohexane"
    // 2. If single substituent with locant (e.g., "2-methyl"): already has hyphen, join directly → "2-methylcyclohexane"
    // 3. If multiple substituents on chain/ring: join with hyphens between them → "2,2-dichloro-1-methylcyclohexane"
    // 4. If multiple substituents on heteroatom (no locants): join directly → "ethylmethylsilane"
    
    if (process.env.VERBOSE) {
      console.log('[DEBUG] substituentParts before join:', JSON.stringify(substituentParts));
      console.log('[DEBUG] isHeteroatomParent:', isHeteroatomParent);
    }
    
    if (substituentParts.length === 1) {
      // Single substituent - join directly (it may already have a locant with hyphen)
      name += substituentParts[0];
    } else if (substituentParts.length > 1) {
      // Multiple substituents - join differently based on parent type
      if (isHeteroatomParent) {
        // Heteroatom parents: no locants, join directly (e.g., "ethylmethylsilane")
        name += substituentParts.join('');
      } else {
        // Chain/ring parents: have locants, join with hyphens (e.g., "2,2-dichloro-1-methylcyclohexane")
        name += substituentParts.join('-');
      }
    }
  }

  // Add parent structure
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
    // Handle multiplicative suffix (e.g., dione, trione)
    if (principalGroup.isMultiplicative && principalGroup.multiplicity > 1) {
      // For multiplicative suffixes starting with a consonant, keep the terminal 'e'
      // This follows IUPAC rule P-16.3.1: hexane-2,4-dione (not hexan-2,4-dione)
      // Build suffix: "dione", "trione", etc.
      const multiplicityPrefix = getMultiplicativePrefix(principalGroup.multiplicity);
      const baseSuffix = principalGroup.suffix;
      const multipliedSuffix = `${multiplicityPrefix}${baseSuffix}`;
      
      // Get locants from locantString (e.g., "2,4")
      const locants = principalGroup.locantString || '';
      
      if (process.env.VERBOSE) {
        console.log(`[buildSubstitutiveName] multiplicative suffix: ${locants}-${multipliedSuffix}`);
      }
      
      if (locants) {
        name += `-${locants}-${multipliedSuffix}`;
      } else {
        name += multipliedSuffix;
      }
    } else {
      // Single functional group - replace terminal 'e' if suffix starts with vowel
      // Replace ending with "an" for saturated systems, "en" for unsaturated
      if (/ane$/.test(name)) {
        name = name.replace(/ane$/, 'an');
      } else if (/ene$/.test(name)) {
        name = name.replace(/ene$/, 'en');
      } else if (/yne$/.test(name)) {
        name = name.replace(/yne$/, 'yn');
      }
      
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