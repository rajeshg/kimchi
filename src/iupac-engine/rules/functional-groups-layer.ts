import type { IUPACRule, FunctionalGroup } from '../types';
import { RulePriority } from '../types';
import type { ImmutableNamingContext } from '../immutable-context';
import { ExecutionPhase, NomenclatureMethod } from '../immutable-context';
import { OPSINFunctionalGroupDetector } from '../opsin-functional-group-detector';
import type { Molecule } from 'types';

/**
 * Functional Group Detection Layer Rules
 * 
 * This layer detects and prioritizes functional groups according to Blue Book P-44.1.
 * The functional group priority determines the parent structure and suffix.
 * 
 * Reference: Blue Book P-44.1 - Principal characteristic group selection
 * https://iupac.qmul.ac.uk/BlueBook/RuleP44.html
 */

/**
 * Find the acyl chain for an ester carbonyl carbon.
 * Traverses from carbonyl carbon through C-C bonds to build the acyl chain.
 * For CCCC(=O)O-, returns [C,C,C,C(=O)] (4 carbons including carbonyl)
 */
function findAcylChain(mol: Molecule, carbonylCarbon: number): number[] {
  const visited = new Set<number>();
  const chain: number[] = [carbonylCarbon];
  visited.add(carbonylCarbon);
  
  // Find carbonyl oxygen and ester oxygen to know which direction to traverse
  let esterOxygen: number | undefined;
  for (const bond of mol.bonds) {
    if (bond.type === 'single' && (bond.atom1 === carbonylCarbon || bond.atom2 === carbonylCarbon)) {
      const otherId = bond.atom1 === carbonylCarbon ? bond.atom2 : bond.atom1;
      const otherAtom = mol.atoms[otherId];
      if (otherAtom?.symbol === 'O') {
        esterOxygen = otherId;
        break;
      }
    }
  }
  
  // BFS to find all carbons in the acyl chain (away from ester oxygen)
  const queue = [carbonylCarbon];
  
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    
    for (const bond of mol.bonds) {
      if (bond.type !== 'single') continue;
      if (bond.atom1 !== currentId && bond.atom2 !== currentId) continue;
      
      const otherId = bond.atom1 === currentId ? bond.atom2 : bond.atom1;
      if (visited.has(otherId)) continue;
      if (otherId === esterOxygen) continue; // Don't traverse into ester oxygen
      
      const otherAtom = mol.atoms[otherId];
      if (otherAtom?.symbol === 'C') {
        visited.add(otherId);
        chain.push(otherId);
        queue.push(otherId);
      }
    }
  }
  
  return chain;
}

/**
 * Build acyloxy name from chain length.
 * Examples: 1 → "formyloxy", 2 → "acetoxy", 3 → "propanoyloxy", 4 → "butanoyloxy"
 */
function buildAcyloxyName(chainLength: number): string {
  const prefixes: Record<number, string> = {
    1: 'formyloxy',     // HC(=O)O-
    2: 'acetoxy',       // CH3C(=O)O- (common name, preferred over "ethanoyloxy")
    3: 'propanoyloxy',  // CH3CH2C(=O)O-
    4: 'butanoyloxy',   // CH3CH2CH2C(=O)O-
    5: 'pentanoyloxy',
    6: 'hexanoyloxy',
    7: 'heptanoyloxy',
    8: 'octanoyloxy',
    9: 'nonanoyloxy',
    10: 'decanoyloxy'
  };
  
  return prefixes[chainLength] || `C${chainLength}anoyloxy`;
}

/**
 * Rule: Principal Group Priority Detection
 * 
 * Implements Blue Book Table 5.1 - Order of seniority of classes
 * Highest: Acids (1) → Lowest: Halides (12)
 */
export const FUNCTIONAL_GROUP_PRIORITY_RULE: IUPACRule = {
  id: 'functional-group-priority',
  name: 'Functional Group Priority Detection',
  description: 'Detect and prioritize functional groups per Blue Book Table 5.1',
  blueBookReference: 'P-44.1 - Principal characteristic group selection',
  priority: RulePriority.SIX,  // 60 - Consolidate all FG detections (runs after individual detections)
  conditions: (context: ImmutableNamingContext) => context.getState().molecule.atoms.length > 0,
  action: (context: ImmutableNamingContext) => {
    // Use OPSIN detector directly so we can capture pattern metadata for traceability
  const mol = context.getState().molecule;
  const detected = opsinDetector.detectFunctionalGroups(mol);
  
  if (process.env.VERBOSE) {
    console.log('[FUNCTIONAL_GROUP_PRIORITY_RULE] Molecule has rings?', mol.rings?.length || 0);
    console.log('[FUNCTIONAL_GROUP_PRIORITY_RULE] Detected functional groups (raw):', detected.map((d: any) => ({ pattern: d.pattern, type: d.type, name: d.name, priority: d.priority })));
  }

    // Build normalized functional groups and a parallel trace metadata array
    const traceMeta: Array<{ pattern?: string; type?: string; atomIds: number[] }> = [];
    const functionalGroups: FunctionalGroup[] = detected.map((d: any) => {
      const rawName = (d.name || d.type || d.pattern || '').toString().toLowerCase();
      const type = rawName.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      // d.atoms contains atom indices (numbers), convert to Atom objects
      const atomIndices = d.atoms || [];
      const atoms = atomIndices.map((idx: number) => mol.atoms[idx]).filter((a: any) => a !== undefined);
      const bonds = d.bonds || [];
      const rawPriority = typeof d.priority === 'number'
        ? d.priority
        : (opsinDetector.getFunctionalGroupPriority(d.pattern || d.type) || FUNCTIONAL_GROUP_PRIORITIES[type] || 0);
      const priority = normalizePriority(rawPriority);

      traceMeta.push({ pattern: d.pattern || d.type, type, atomIds: atomIndices });

      // For ketones and aldehydes, only the carbonyl carbon (first atom) should be in locants
      // The oxygen is needed in atoms[] for detection, but not for locant numbering
      const isKetoneOrAldehyde = type === 'ketone' || type === 'aldehyde';
      const locantAtoms = isKetoneOrAldehyde ? atoms.slice(0, 1) : atoms;
      
      return {
        type,
        atoms,
        bonds,
        suffix: d.suffix || opsinDetector.getFunctionalGroupSuffix(d.pattern || d.type) || undefined,
        prefix: d.prefix || undefined,
        priority,
        isPrincipal: false,
        locants: locantAtoms.map((a: any) => (a && typeof a.id === 'number') ? a.id : -1)
      } as FunctionalGroup;
    });

    if (process.env.VERBOSE) {
      console.log('[FUNCTIONAL_GROUP_PRIORITY_RULE] Normalized functional groups:', functionalGroups.map((fg: any) => ({ type: fg.type, priority: fg.priority, locants: fg.locants }))); 
    }
  // sort by priority (higher numeric value = higher priority)
  functionalGroups.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    const principalGroup = selectPrincipalGroup(functionalGroups);
    const priorityScore = calculateFunctionalGroupPriority(functionalGroups);

    if (process.env.VERBOSE) {
      console.log('[FUNCTIONAL_GROUP_PRIORITY_RULE] Selected principalGroup:', principalGroup && ({ type: principalGroup.type, priority: principalGroup.priority, locants: principalGroup.locants }));
      console.log('[FUNCTIONAL_GROUP_PRIORITY_RULE] functional group priority score:', priorityScore);
    }

    // Mark ALL functional groups of the principal type as principal
    // (e.g., if we have 2 ketones, both should be marked as principal)
    // EXCEPT for hierarchical esters - only mark the primary ester as principal
    let updatedFunctionalGroups = principalGroup
      ? functionalGroups.map(g => {
          if (g.type === principalGroup.type && g.priority === principalGroup.priority) {
            return {
              ...g,
              isPrincipal: true
            } as FunctionalGroup;
          }
          return g;
        })
      : functionalGroups;

    // Special handling for hierarchical esters
    // If we have multiple esters and they're hierarchical, only mark the primary ester as principal
    if (principalGroup?.type === 'ester') {
      const esters = updatedFunctionalGroups.filter(fg => fg.type === 'ester');
      if (esters.length >= 2) {
        const hierarchyResult = analyzeEsterHierarchy(context, esters);
        if (hierarchyResult.isHierarchical && hierarchyResult.primaryEsterAtoms) {
          if (process.env.VERBOSE) {
            console.log('[FUNCTIONAL_GROUP_PRIORITY_RULE] Detected hierarchical esters - marking only primary ester as principal');
            console.log('[FUNCTIONAL_GROUP_PRIORITY_RULE] Primary ester atoms:', hierarchyResult.primaryEsterAtoms);
          }
          // Only mark the primary ester as principal, demote nested esters
          const primaryAtomSet = new Set(hierarchyResult.primaryEsterAtoms);
          updatedFunctionalGroups = updatedFunctionalGroups.map(fg => {
            if (fg.type === 'ester') {
              // Check if this ester's atoms match the primary ester
              const fgAtomIds = fg.atoms.map((a: any) => typeof a === 'number' ? a : a.id);
              const isPrimaryEster = fgAtomIds.some(id => primaryAtomSet.has(id));
              return {
                ...fg,
                isPrincipal: isPrimaryEster
              } as FunctionalGroup;
            }
            return fg;
          });
        }
      }
    }

    // Convert non-principal ethers to alkoxy substituents
    // This must happen AFTER principal group is marked
    for (let i = 0; i < updatedFunctionalGroups.length; i++) {
      const fg = updatedFunctionalGroups[i];
      if (!fg) continue;
      
      // Only convert ethers that are NOT the principal group
      if (fg.type === 'ether' && !fg.isPrincipal) {
        const oxygenAtomOrId = fg.atoms?.[0]; // Could be Atom object or atom ID
        if (!oxygenAtomOrId) {
          continue;
        }

        // Handle both Atom objects and atom IDs
        const oxygenId = typeof oxygenAtomOrId === 'number' ? oxygenAtomOrId : oxygenAtomOrId.id;
        const oxygenAtom = mol.atoms.find((a: any) => a.id === oxygenId);

        if (!oxygenAtom) {
          continue;
        }

        // Find the two carbon atoms bonded to the oxygen
        const carbonBonds = mol.bonds.filter((bond: any) =>
          (bond.atom1 === oxygenId || bond.atom2 === oxygenId) && bond.type === 'single'
        );

        const bondedCarbons = carbonBonds
          .map((bond: any) => {
            const otherId = bond.atom1 === oxygenId ? bond.atom2 : bond.atom1;
            return mol.atoms.find((a: any) => a.id === otherId);
          })
          .filter((a: any) => a && a.symbol === 'C');

        if (bondedCarbons.length !== 2) {
          continue;
        }

        // Determine which carbon is part of the parent chain and which is the substituent
        const alkoxyName = analyzeAlkoxySubstituent(mol, oxygenAtom, bondedCarbons);

        updatedFunctionalGroups[i] = {
          ...fg,
          type: 'alkoxy',
          prefix: alkoxyName,
          atoms: fg.atoms || []
        } as FunctionalGroup;
      }
    }

    // Convert non-principal esters to acyloxy substituents (e.g., "butanoyloxy")
    // This must happen AFTER principal group is marked
    for (let i = 0; i < updatedFunctionalGroups.length; i++) {
      const fg = updatedFunctionalGroups[i];
      if (!fg) continue;
      
      // Only convert esters that are NOT the principal group
      if (fg.type === 'ester' && !fg.isPrincipal) {
        if (process.env.VERBOSE) {
          console.log('[FUNCTIONAL_GROUP_PRIORITY_RULE] Converting non-principal ester to acyloxy substituent:', fg.atoms);
        }
        
        // Find the carbonyl carbon and build the acyl chain name
        const esterAtomIds = fg.atoms.map((a: any) => typeof a === 'number' ? a : a.id);
        let carbonylCarbon: number | undefined;
        
        // Find C=O bond
        for (const bond of mol.bonds) {
          if (bond.type === 'double') {
            const atom1 = mol.atoms[bond.atom1];
            const atom2 = mol.atoms[bond.atom2];
            
            if (atom1?.symbol === 'C' && atom2?.symbol === 'O' && esterAtomIds.includes(bond.atom1)) {
              carbonylCarbon = bond.atom1;
              break;
            } else if (atom1?.symbol === 'O' && atom2?.symbol === 'C' && esterAtomIds.includes(bond.atom2)) {
              carbonylCarbon = bond.atom2;
              break;
            }
          }
        }
        
        if (!carbonylCarbon) continue;
        
        // Find the acyl chain (carbons attached to carbonyl, excluding the ester oxygen side)
        // For CCCC(=O)O-, we want to traverse from the carbonyl carbon through C-C bonds
        const acylChainAtoms = findAcylChain(mol, carbonylCarbon);
        const chainLength = acylChainAtoms.length;
        
        // Build acyloxy name: "butanoyloxy" for 4-carbon chain
        const acyloxyName = buildAcyloxyName(chainLength);
        
        if (process.env.VERBOSE) {
          console.log('[FUNCTIONAL_GROUP_PRIORITY_RULE] Acyl chain length:', chainLength, 'name:', acyloxyName);
        }
        
        updatedFunctionalGroups[i] = {
          ...fg,
          type: 'acyloxy',
          prefix: acyloxyName,
          atoms: fg.atoms || []
        } as FunctionalGroup;
      }
    }

    // Update functional groups
    let updatedContext = context.withFunctionalGroups(
      updatedFunctionalGroups,
      'functional-group-priority',
      'Functional Group Priority Detection',
      'P-44.1',
      ExecutionPhase.FUNCTIONAL_GROUP,
      'Detected and prioritized functional groups'
    );

    // Attach OPSIN trace metadata into context state (not on FunctionalGroup objects)
    updatedContext = updatedContext.withStateUpdate(
      (state: any) => ({ ...state, functionalGroupTrace: traceMeta }),
      'functional-group-trace',
      'Functional Group Trace Metadata',
      'P-44.1',
      ExecutionPhase.FUNCTIONAL_GROUP,
      'Attach OPSIN pattern metadata for detected functional groups'
    );

    // Update principal group and priority in state
    updatedContext = updatedContext.withStateUpdate(
      (state) => ({
        ...state,
        principalGroup,
        functionalGroupPriority: priorityScore
      }),
      'functional-group-priority',
      'Functional Group Priority Detection',
      'P-44.1',
      ExecutionPhase.FUNCTIONAL_GROUP,
      'Set principal group and priority score'
    );

    return updatedContext;
  }
};

/**
 * Rule: Functional Class Nomenclature Detection
 * 
 * Determines if the compound should be named using functional class nomenclature
 * according to P-51.2
 */
export const FUNCTIONAL_CLASS_RULE: IUPACRule = {
  id: 'functional-class-nomenclature',
  name: 'Functional Class Nomenclature Detection',
  description: 'Detect if functional class nomenclature should be used (P-51.2)',
  blueBookReference: 'P-51.2 - Functional class nomenclature',
  priority: RulePriority.ONE,  // 10 - Functional class runs last (lowest priority)
  conditions: (context: ImmutableNamingContext) => context.getState().functionalGroups.length > 0,
  action: (context: ImmutableNamingContext) => {
    // If a nomenclature method has already been chosen by an earlier rule
    // (for example ESTER_DETECTION_RULE), do not overwrite it here. This
    // preserves ester-specific functional-class decisions and avoids
    // later rules clobbering them.
    const principalGroup = context.getState().principalGroup;
    const existingMethod = context.getState().nomenclatureMethod;
    if (existingMethod) {
      if (process.env.VERBOSE) {
        console.log('[FUNCTIONAL_CLASS_RULE] Nomenclature method already set, skipping functional-class evaluation');
      }
      return context;
    }

    let updatedContext: ImmutableNamingContext;
    if (isFunctionalClassPreferred(principalGroup)) {
      updatedContext = context.withNomenclatureMethod(
        NomenclatureMethod.FUNCTIONAL_CLASS,
        'functional-class-nomenclature',
        'Functional Class Nomenclature Detection',
        'P-51.2',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Set nomenclature method to functional class'
      );
      updatedContext = updatedContext.withStateUpdate(
        (state) => ({ ...state, useFunctionalClass: true }),
        'functional-class-nomenclature',
        'Functional Class Nomenclature Detection',
        'P-51.2',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Set useFunctionalClass to true'
      );
    } else {
      updatedContext = context.withNomenclatureMethod(
        NomenclatureMethod.SUBSTITUTIVE,
        'functional-class-nomenclature',
        'Functional Class Nomenclature Detection',
        'P-51.2',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Set nomenclature method to substitutive'
      );
      updatedContext = updatedContext.withStateUpdate(
        (state) => ({ ...state, useFunctionalClass: false }),
        'functional-class-nomenclature',
        'Functional Class Nomenclature Detection',
        'P-51.2',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Set useFunctionalClass to false'
      );
    }
    return updatedContext;
  }
};

/**
 * Analyze ester connectivity to detect hierarchical vs symmetric diesters
 * 
 * Hierarchical ester: One ester's alkyl group contains another ester
 *   Example: CCCC(=O)OCC(OCC)OC(=O)CCC
 *   Structure: R-C(=O)-O-[alkyl group containing another ester]
 *   Named as: (2-butanoyloxy-2-ethoxyethyl)butanoate (monoester with complex alkyl)
 * 
 * Symmetric diester: Two independent ester groups
 *   Example: CH3OC(=O)CC(=O)OCH3
 *   Structure: R1-O-C(=O)-R-C(=O)-O-R2
 *   Named as: dimethyl butanedioate
 * 
 * Returns: { isHierarchical: boolean, primaryEsterAtoms?: number[] }
 */
function analyzeEsterHierarchy(context: ImmutableNamingContext, esters: FunctionalGroup[]): {
  isHierarchical: boolean;
  primaryEsterAtoms?: number[];
} {
  if (esters.length < 2) {
    return { isHierarchical: false };
  }

  const mol = context.getState().molecule;
  
  if (process.env.VERBOSE) {
    console.log('[analyzeEsterHierarchy] Starting analysis with', esters.length, 'esters');
  }
  
  // For each ester, identify:
  // - carbonylCarbon: C in C(=O)O
  // - esterOxygen: O in C(=O)-O-C
  // - alkoxyCarbon: first C in C(=O)-O-C
  
  const esterStructures = esters.map((ester, idx) => {
    if (process.env.VERBOSE) {
      console.log(`[analyzeEsterHierarchy] Analyzing ester ${idx}:`, ester);
      console.log(`[analyzeEsterHierarchy] Ester atoms type:`, typeof ester.atoms, Array.isArray(ester.atoms));
      if (Array.isArray(ester.atoms)) {
        console.log(`[analyzeEsterHierarchy] First atom:`, ester.atoms[0]);
      }
    }
    // ester.atoms might be an array of atom IDs (numbers) or Atom objects
    // Let's handle both cases
    const esterAtomIds = new Set(
      ester.atoms.map(a => typeof a === 'number' ? a : (a?.id ?? -1))
    );
    if (process.env.VERBOSE) {
      console.log(`[analyzeEsterHierarchy] Ester ${idx} atom IDs:`, Array.from(esterAtomIds));
    }
    let carbonylCarbon: number | undefined;
    let carbonylOxygen: number | undefined;
    let esterOxygen: number | undefined;
    let alkoxyCarbon: number | undefined;
    
    // Find C=O bond
    for (const bond of mol.bonds) {
      if (bond.type === 'double') {
        const atom1 = mol.atoms[bond.atom1];
        const atom2 = mol.atoms[bond.atom2];
        
        if (atom1?.symbol === 'C' && atom2?.symbol === 'O' && esterAtomIds.has(bond.atom1)) {
          carbonylCarbon = bond.atom1;
          carbonylOxygen = bond.atom2;
          break;
        } else if (atom1?.symbol === 'O' && atom2?.symbol === 'C' && esterAtomIds.has(bond.atom2)) {
          carbonylCarbon = bond.atom2;
          carbonylOxygen = bond.atom1;
          break;
        }
      }
    }
    
    if (!carbonylCarbon) return null;
    
    // Find C-O-C bond (ester linkage)
    for (const bond of mol.bonds) {
      if (bond.type === 'single') {
        const atom1 = mol.atoms[bond.atom1];
        const atom2 = mol.atoms[bond.atom2];
        
        if (bond.atom1 === carbonylCarbon && atom1?.symbol === 'C' && atom2?.symbol === 'O') {
          esterOxygen = bond.atom2;
        } else if (bond.atom2 === carbonylCarbon && atom2?.symbol === 'C' && atom1?.symbol === 'O') {
          esterOxygen = bond.atom1;
        }
      }
    }
    
    if (!esterOxygen) return null;
    
    // Find alkoxy carbon
    for (const bond of mol.bonds) {
      if (bond.type === 'single') {
        const atom1 = mol.atoms[bond.atom1];
        const atom2 = mol.atoms[bond.atom2];
        
        if (bond.atom1 === esterOxygen && atom2?.symbol === 'C' && bond.atom2 !== carbonylCarbon) {
          alkoxyCarbon = bond.atom2;
          break;
        } else if (bond.atom2 === esterOxygen && atom1?.symbol === 'C' && bond.atom1 !== carbonylCarbon) {
          alkoxyCarbon = bond.atom1;
          break;
        }
      }
    }
    
    if (!alkoxyCarbon) return null;
    
    return { carbonylCarbon, carbonylOxygen, esterOxygen, alkoxyCarbon, esterAtomIds };
  }).filter(s => s !== null);
  
  if (esterStructures.length < 2) {
    return { isHierarchical: false };
  }
  
  // Check if any ester's alkyl group contains another ester's carbonyl carbon
  // We need to traverse from alkoxyCarbon and see if we reach another ester's carbonyl
  
  for (let i = 0; i < esterStructures.length; i++) {
    const ester1 = esterStructures[i];
    if (!ester1) continue;
    
    // Traverse the alkyl group starting from ester1's alkoxyCarbon
    const visited = new Set<number>();
    const queue = [ester1.alkoxyCarbon];
    const alkylGroupAtoms = new Set<number>();
    
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      alkylGroupAtoms.add(currentId);
      
      // Find all neighbors
      for (const bond of mol.bonds) {
        if (bond.atom1 === currentId || bond.atom2 === currentId) {
          const otherId = bond.atom1 === currentId ? bond.atom2 : bond.atom1;
          
          // Don't go back through the ester oxygen
          if (otherId === ester1.esterOxygen) continue;
          
          if (!visited.has(otherId)) {
            queue.push(otherId);
          }
        }
      }
    }
    
    // Check if any other ester's carbonyl carbon is in this alkyl group
    for (let j = 0; j < esterStructures.length; j++) {
      if (i === j) continue;
      const ester2 = esterStructures[j];
      if (!ester2) continue;
      
      if (alkylGroupAtoms.has(ester2.carbonylCarbon)) {
        if (process.env.VERBOSE) {
          console.log(`[analyzeEsterHierarchy] Hierarchical ester detected: ester at atom ${ester2.carbonylCarbon} is nested in alkyl group of ester at atom ${ester1.carbonylCarbon}`);
        }
        // ester1 is the primary ester, ester2 is nested in its alkyl group
        return {
          isHierarchical: true,
          primaryEsterAtoms: [ester1.carbonylCarbon, ester1.esterOxygen]
        };
      }
    }
  }
  
  if (process.env.VERBOSE) {
    console.log('[analyzeEsterHierarchy] No hierarchical relationship found - independent diesters');
  }
  
  return { isHierarchical: false };
}

/**
 * Check if an ester group is part of a ring (lactone)
 * A lactone has both the carbonyl carbon and ester oxygen in the ring
 * 
 * For esters detected by OPSIN, esterGroup.atoms contains:
 * [carbonyl C id, carbonyl O id, ester O id] (3 atom IDs as numbers)
 */
function isEsterInRing(mol: any, esters: FunctionalGroup[]): boolean {
  // First detect all rings in the molecule
  const rings = findAllRings(mol);
  if (rings.length === 0) return false;
  
  // For each ester, check if both carbonyl C and ester O are in the same ring
  for (const ester of esters) {
    if (!ester.atoms || ester.atoms.length < 3) continue;
    
    // OPSIN returns atoms as numbers: [carbonyl C id, carbonyl O id, ester O id]
    const carbonylCarbon = ester.atoms[0] as unknown as number;
    const esterOxygen = ester.atoms[2] as unknown as number;
    
    if (process.env.VERBOSE) {
      console.log('[isEsterInRing] Checking ester: carbonylC=', carbonylCarbon, 'esterO=', esterOxygen);
    }
    
    // Check if both atoms are in the same ring
    for (const ring of rings) {
      const inRing = ring.includes(carbonylCarbon) && ring.includes(esterOxygen);
      if (inRing) {
        if (process.env.VERBOSE) {
          console.log('[isEsterInRing] Lactone detected: ester atoms', [carbonylCarbon, esterOxygen], 'in ring', ring);
        }
        return true;
      }
    }
  }
  
  if (process.env.VERBOSE) {
    console.log('[isEsterInRing] Not a lactone: ester not in any ring');
  }
  return false;
}

/**
 * Find all rings in a molecule using DFS cycle detection
 * Returns array of rings, where each ring is an array of atom IDs
 */
function findAllRings(mol: any): number[][] {
  const adj = new Map<number, number[]>();
  for (const atom of mol.atoms) {
    adj.set(atom.id, []);
  }
  
  for (const bond of mol.bonds) {
    const neighbors1 = adj.get(bond.atom1);
    const neighbors2 = adj.get(bond.atom2);
    if (neighbors1) neighbors1.push(bond.atom2);
    if (neighbors2) neighbors2.push(bond.atom1);
  }
  
  const rings: number[][] = [];
  const visited = new Set<number>();
  
  function findRingDFS(atomId: number, parent: number, path: number[]): void {
    visited.add(atomId);
    path.push(atomId);
    
    const neighbors = adj.get(atomId) || [];
    for (const neighborId of neighbors) {
      if (neighborId === parent) continue;
      
      const cycleStart = path.indexOf(neighborId);
      if (cycleStart >= 0) {
        // Found a cycle
        const ring = path.slice(cycleStart);
        rings.push(ring);
      } else if (!visited.has(neighborId)) {
        findRingDFS(neighborId, atomId, path);
      }
    }
    
    path.pop();
  }
  
  for (const atom of mol.atoms) {
    if (!visited.has(atom.id)) {
      findRingDFS(atom.id, -1, []);
    }
  }
  
  return rings;
}

/**
 * Inspect the alkoxy side of an ester functional group
 * Returns information about the alkoxy group: set of carbon atom IDs, whether chain is branched,
 * and whether any other functional groups are attached to the alkoxy carbons.
 */
function getAlkoxyGroupInfo(context: ImmutableNamingContext, ester: FunctionalGroup) {
  const mol = context.getState().molecule;
  const esterAtomIds = (ester.atoms || []).map((a: any) => typeof a === 'number' ? a : (a?.id ?? -1));

  // Find carbonyl carbon
  let carbonylCarbon: number | undefined;
  for (const bond of mol.bonds) {
    if (bond.type === 'double') {
      const a1 = mol.atoms[bond.atom1];
      const a2 = mol.atoms[bond.atom2];
      if (a1?.symbol === 'C' && a2?.symbol === 'O' && esterAtomIds.includes(bond.atom1)) {
        carbonylCarbon = bond.atom1; break;
      }
      if (a2?.symbol === 'C' && a1?.symbol === 'O' && esterAtomIds.includes(bond.atom2)) {
        carbonylCarbon = bond.atom2; break;
      }
    }
  }
  if (!carbonylCarbon) return { alkoxyCarbonIds: new Set<number>(), chainLength: 0, branched: false, hasAttachedFG: false };

  // find ester oxygen bonded to carbonyl carbon
  let esterOxygen: number | undefined;
  for (const bond of mol.bonds) {
    if (bond.type === 'single') {
      if (bond.atom1 === carbonylCarbon && mol.atoms[bond.atom2]?.symbol === 'O') {
        esterOxygen = bond.atom2; break;
      } else if (bond.atom2 === carbonylCarbon && mol.atoms[bond.atom1]?.symbol === 'O') {
        esterOxygen = bond.atom1; break;
      }
    }
  }
  if (!esterOxygen) return { alkoxyCarbonIds: new Set<number>(), chainLength: 0, branched: false, hasAttachedFG: false };

  // find the alkoxy carbon (carbon bonded to ester oxygen, not the carbonyl carbon)
  let alkoxyCarbon: number | undefined;
  for (const bond of mol.bonds) {
    if (bond.type === 'single') {
      if (bond.atom1 === esterOxygen && mol.atoms[bond.atom2]?.symbol === 'C' && bond.atom2 !== carbonylCarbon) {
        alkoxyCarbon = bond.atom2; break;
      } else if (bond.atom2 === esterOxygen && mol.atoms[bond.atom1]?.symbol === 'C' && bond.atom1 !== carbonylCarbon) {
        alkoxyCarbon = bond.atom1; break;
      }
    }
  }
  if (!alkoxyCarbon) return { alkoxyCarbonIds: new Set<number>(), chainLength: 0, branched: false, hasAttachedFG: false };

  // BFS from alkoxyCarbon to collect connected alkoxy carbons (do not cross ester oxygen)
  const visited = new Set<number>();
  const queue = [alkoxyCarbon];
  const alkoxyCarbonIds = new Set<number>();
  let branched = false;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    alkoxyCarbonIds.add(cur);

    // find single-bonded carbon neighbors excluding the ester oxygen and the carbonyl region
    const neighborCarbons: number[] = [];
    for (const b of mol.bonds) {
      if (b.type !== 'single') continue;
      if (b.atom1 === cur && mol.atoms[b.atom2]?.symbol === 'C') neighborCarbons.push(b.atom2);
      if (b.atom2 === cur && mol.atoms[b.atom1]?.symbol === 'C') neighborCarbons.push(b.atom1);
    }

    // Exclude going back through the ester oxygen
    const filtered = neighborCarbons.filter(n => n !== esterOxygen);

    // Determine side-branches (neighbors that are not part of the main alkoxy carbon set)
    const sideBranches = filtered.filter(n => !alkoxyCarbonIds.has(n));

    if (sideBranches.length > 0) {
      // If side branches exist, check whether they are *only* silyl-type branches
      // (carbon attached to an O which in turn is bonded to Si). If ALL side branches
      // are silyl-type, do not treat as true branching for complexity purposes.
      let nonSilylFound = false;
      for (const sb of sideBranches) {
        const sbAtom = mol.atoms[sb];
        if (!sbAtom) { nonSilylFound = true; break; }

        // Find oxygen neighbors of this side-branch carbon
        const oxyNeighbors = mol.bonds
          .filter((bb: any) => (bb.atom1 === sb || bb.atom2 === sb) && bb.type === 'single')
          .map((bb: any) => (bb.atom1 === sb ? bb.atom2 : bb.atom1))
          .map((id: number) => mol.atoms[id])
          .filter((a: any) => a && a.symbol === 'O');

        if (oxyNeighbors.length === 0) {
          nonSilylFound = true;
          break;
        }

        // For each oxygen neighbor, check if it connects to silicon
        const connectsToSi = oxyNeighbors.some((o: any) => {
          const neigh = mol.bonds
            .filter((bb: any) => (bb.atom1 === o.id || bb.atom2 === o.id) && bb.type === 'single')
            .map((bb: any) => (bb.atom1 === o.id ? bb.atom2 : bb.atom1))
            .map((id: number) => mol.atoms[id]);
          return neigh.some((na: any) => na && na.symbol === 'Si');
        });

        if (!connectsToSi) {
          nonSilylFound = true;
          break;
        }
      }

      if (nonSilylFound) {
        branched = true;
      } else {
        // side branches are only silyl-type — treat as not branched for complexity
        branched = branched || false;
      }
    } else {
      // No side branches; if multiple continuation neighbors exist, that's true branching
      if (filtered.length > 1) branched = true;
    }

    for (const n of filtered) {
      if (!visited.has(n)) queue.push(n);
    }
  }

  const chainLength = alkoxyCarbonIds.size;

  // Check if any heteroatoms or substituents are attached to the alkoxy carbons
  // (this is a conservative proxy for attached functional groups)
  let hasAttachedFG = false;
  for (const cid of Array.from(alkoxyCarbonIds)) {
    for (const b of mol.bonds) {
      const other = b.atom1 === cid ? b.atom2 : (b.atom2 === cid ? b.atom1 : undefined);
      if (other === undefined) continue;
      if (other === esterOxygen) continue;
      const otherAtom = mol.atoms[other];
      if (!otherAtom) continue;
      // If the alkoxy carbon is bonded to a heteroatom (non-C, non-H) or to a carbon that is not part of the straight alkoxy chain,
      // treat as having an attached functional group. However, silyl-protection (O-SiR3) is common and
      // should NOT by itself make the alkoxy "complex". Detect an oxygen that connects to a silicon
      // (silyl group) and ignore it for complexity purposes.
      if (otherAtom.symbol !== 'C' && otherAtom.symbol !== 'H') {
        // If the heteroatom is an oxygen, check if it connects to a silicon (silyl protection)
        if (otherAtom.symbol === 'O') {
          // Look for a silicon neighbor of this oxygen (excluding the alkoxy carbon)
          const neighs = mol.bonds.filter((bb: any) => (bb.atom1 === other || bb.atom2 === other) && bb.type === 'single')
            .map((bb: any) => (bb.atom1 === other ? bb.atom2 : bb.atom1))
            .filter((id: number) => id !== cid);
          const hasSi = neighs.some((nid: number) => mol.atoms[nid] && mol.atoms[nid].symbol === 'Si');
          if (hasSi) {
            // silyl-protected oxygen — ignore for complexity
            continue;
          }
        }
        hasAttachedFG = true; break;
      }
      // If bonded carbon is not in the alkoxyCarbonIds set, it may indicate branching/substituent
      if (otherAtom.symbol === 'C' && !alkoxyCarbonIds.has(other)) {
        hasAttachedFG = true; break;
      }
    }
    if (hasAttachedFG) break;
  }

  return { alkoxyCarbonIds, chainLength, branched, hasAttachedFG };
}

/**
 * Check if an ester is suitable for functional class nomenclature
 * Functional class nomenclature is used for:
 * - Simple esters (single ester, no complex features)
 * - Diesters and polyesters (multiple ester groups)
 * 
 * Substitutive nomenclature is used when:
 * - The ester is a lactone (ester group is part of a ring)
 * - The molecule has other high-priority functional groups
 * - Hierarchical esters (one ester nested in another's alkyl group)
 */
function checkIfSimpleEster(context: ImmutableNamingContext, esters: FunctionalGroup[]): boolean {
  const mol = context.getState().molecule;
  const allFunctionalGroups = detectAllFunctionalGroups(context);
  
  if (process.env.VERBOSE) {
    console.log('[checkIfSimpleEster] Checking ester complexity:', {
      esterCount: esters.length,
      atomCount: mol.atoms.length
    });
  }
  
  // Check if ester is a LACTONE (ester group is part of a ring)
  // If the ester C=O and O are both in a ring → lactone → use substitutive nomenclature
  // If there are rings but ester is NOT in the ring → use functional class nomenclature
  const isLactone = isEsterInRing(mol, esters);
  if (isLactone) {
    if (process.env.VERBOSE) console.log('[checkIfSimpleEster] Ester is lactone (in ring) → use substitutive');
    return false;
  }
  
  if (process.env.VERBOSE) {
    const hasRings = detectSimpleRings(mol);
    if (hasRings) {
      console.log('[checkIfSimpleEster] Has rings but ester NOT in ring → use functional class');
    }
  }
  
  // Check for higher-priority functional groups that would override ester as principal group
  // Use dynamic comparison with normalized priorities so scales match (engine uses larger numbers
  // for higher priority). Normalize the detector-provided priority to the engine scale.
  const rawEsterPriority = typeof opsinDetector.getFunctionalGroupPriority === 'function'
    ? (opsinDetector.getFunctionalGroupPriority('ester') || FUNCTIONAL_GROUP_PRIORITIES.ester || 0)
    : (FUNCTIONAL_GROUP_PRIORITIES.ester || 0);
  const esterPriority = normalizePriority(rawEsterPriority);
  const higherPriorityGroups = allFunctionalGroups.filter(fg => 
    fg.type !== 'ester' && 
    fg.type !== 'ether' && 
    fg.type !== 'alkoxy' &&
    ((fg.priority || opsinDetector.getFunctionalGroupPriority(fg.type) || FUNCTIONAL_GROUP_PRIORITIES[fg.type as keyof typeof FUNCTIONAL_GROUP_PRIORITIES] || 0) > esterPriority)
  );
  
  // Has higher-priority functional groups → use substitutive nomenclature
  if (higherPriorityGroups.length > 0) {
    if (process.env.VERBOSE) console.log('[checkIfSimpleEster] Higher priority FGs:', higherPriorityGroups.map(fg => fg.type));
    return false;
  }
  
  if (process.env.VERBOSE) {
    const otherFunctionalGroups = allFunctionalGroups.filter(fg => 
      fg.type !== 'ester' && fg.type !== 'ether' && fg.type !== 'alkoxy'
    );
    if (otherFunctionalGroups.length > 0) {
      console.log('[checkIfSimpleEster] Other (lower priority) FGs that are OK:', otherFunctionalGroups.map(fg => `${fg.type}(${fg.priority})`));
    }
  }
  
  // Check for hierarchical esters (nested esters) → use substitutive nomenclature
  if (esters.length >= 2) {
    if (process.env.VERBOSE) console.log('[checkIfSimpleEster] Checking for hierarchical esters, count:', esters.length);
    const hierarchy = analyzeEsterHierarchy(context, esters);
    if (hierarchy.isHierarchical) {
      if (process.env.VERBOSE) console.log('[checkIfSimpleEster] Hierarchical ester detected → complex');
      return false;
    }
  }

  // Inspect alkoxy groups for branching or substituents
  // NOTE: Branching and attached functional groups are OK for functional class nomenclature
  // The complex alkoxy name will be handled by getAlkoxyGroupName() using bracket notation
  // e.g., [2-methyl-1-[4-nitro-3-(trifluoromethyl)anilino]-1-oxopropan-2-yl]butanoate
  // Only truly problematic cases (nested esters within alkoxy chain) should use substitutive
  for (const ester of esters) {
    try {
      const info = getAlkoxyGroupInfo(context, ester as FunctionalGroup);
      if (process.env.VERBOSE) console.log('[checkIfSimpleEster] Alkoxy info:', info);

      // Allow branched and substituted alkoxy chains - functional class can handle these
      // The naming logic in ester-naming.ts will generate proper bracketed names
      if (process.env.VERBOSE && (info.branched || info.hasAttachedFG)) {
        console.log('[checkIfSimpleEster] Alkoxy chain is branched or has attached FG -> will use complex functional class naming');
      }
      
      // No restrictions here - functional class nomenclature can handle complexity
    } catch (e) {
      if (process.env.VERBOSE) console.log('[checkIfSimpleEster] Error analyzing alkoxy group:', e);
      // On error, still allow functional class - the ester-naming.ts logic will handle it
    }
  }
  
  if (process.env.VERBOSE) console.log('[checkIfSimpleEster] Suitable for functional class nomenclature');
  // All checks passed → use functional class nomenclature
  return true;
}

/**
 * Simple ring detection to check if molecule contains rings
 * Returns true if any atom is part of a ring
 */
function detectSimpleRings(mol: any): boolean {
  // Build adjacency list
  const adj = new Map<number, number[]>();
  for (const atom of mol.atoms) {
    adj.set(atom.id, []);
  }
  
  for (const bond of mol.bonds) {
    const neighbors1 = adj.get(bond.atom1);
    const neighbors2 = adj.get(bond.atom2);
    if (neighbors1) neighbors1.push(bond.atom2);
    if (neighbors2) neighbors2.push(bond.atom1);
  }
  
  // DFS to detect cycles
  const visited = new Set<number>();
  const recStack = new Set<number>();
  
  function hasCycleDFS(atomId: number, parent: number): boolean {
    visited.add(atomId);
    recStack.add(atomId);
    
    const neighbors = adj.get(atomId) || [];
    for (const neighborId of neighbors) {
      if (neighborId === parent) continue; // Skip the edge we came from
      
      if (recStack.has(neighborId)) {
        return true; // Found a cycle
      }
      
      if (!visited.has(neighborId)) {
        if (hasCycleDFS(neighborId, atomId)) {
          return true;
        }
      }
    }
    
    recStack.delete(atomId);
    return false;
  }
  
  // Check each connected component
  for (const atom of mol.atoms) {
    if (!visited.has(atom.id)) {
      if (hasCycleDFS(atom.id, -1)) {
        return true;
      }
    }
  }
  
  return false;
}


/**
 * Rule: Ester Detection
 * 
 * Special case for esters which prefer functional class nomenclature
 * Example: CH3COOCH3 → methyl acetate (not methoxymethanone)
 * 
 * Complex molecules with esters should use substitutive nomenclature instead
 */

export const ESTER_DETECTION_RULE: IUPACRule = {
  id: 'ester-detection',
  name: 'Ester Detection',
  description: 'Detect ester functional groups for functional class naming',
  blueBookReference: 'P-51.2.1 - Esters',
  priority: RulePriority.FIVE,  // 50 - Must run AFTER FUNCTIONAL_GROUP_PRIORITY_RULE (60)
  conditions: (context: ImmutableNamingContext) => {
    // Check if there are any esters in the functional groups (detected by OPSIN or other detectors)
    const functionalGroups = context.getState().functionalGroups;
    const esters = functionalGroups.filter(fg => fg.type === 'ester');
    if (process.env.VERBOSE) console.log('[ESTER_DETECTION_RULE] Checking conditions, esters found:', esters.length);
    return esters.length > 0;
  },
  action: (context: ImmutableNamingContext) => {
    // Get esters from already-detected functional groups
    const functionalGroups = context.getState().functionalGroups;
    const esters = functionalGroups.filter(fg => fg.type === 'ester');
    
    if (process.env.VERBOSE) console.log('[ESTER_DETECTION_RULE] Found esters in functional groups:', esters.length);
    
    let updatedContext = context;
    
    // Only use functional class nomenclature for simple esters
    // Complex molecules should use substitutive nomenclature
    const isSimpleEster = checkIfSimpleEster(context, esters);
    
    if (process.env.VERBOSE) console.log('[ESTER_DETECTION_RULE] isSimpleEster:', isSimpleEster);
    
    if (isSimpleEster) {
      updatedContext = updatedContext.withNomenclatureMethod(
        NomenclatureMethod.FUNCTIONAL_CLASS,
        'ester-detection',
        'Ester Detection',
        'P-51.2.1',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Set nomenclature method to functional class for simple esters'
      );
    } else {
      // For complex esters, explicitly set substitutive nomenclature
      updatedContext = updatedContext.withNomenclatureMethod(
        NomenclatureMethod.SUBSTITUTIVE,
        'ester-detection',
        'Ester Detection',
        'P-51.2.1',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Set nomenclature method to substitutive for complex esters'
      );
    }
    
    return updatedContext;
  }
};

/**
 * Rule: Lactone to Ketone Conversion
 * 
 * Lactones (cyclic esters) are heterocycles and should be named as such.
 * The ester C(=O)O group in a ring is treated as a ketone (C=O) suffix.
 * 
 * Reference: Blue Book P-66.1.1.4 - Lactones are named as heterocycles
 * Example: CC1(CC(OC1=O)C(C)(C)I)C → 5-(2-iodopropan-2-yl)-3,3-dimethyloxolan-2-one
 */
export const LACTONE_TO_KETONE_RULE: IUPACRule = {
  id: 'lactone-to-ketone',
  name: 'Lactone to Ketone Conversion',
  description: 'Convert cyclic esters (lactones) to ketones for heterocycle naming',
  blueBookReference: 'P-66.1.1.4 - Lactones',
  priority: RulePriority.FOUR,  // 40 - Must run AFTER ESTER_DETECTION_RULE (priority FIVE = 50)
  conditions: (context: ImmutableNamingContext) => {
    // Detect lactones directly: look for carbonyl C=O where the carbon is single-bonded to an O
    // which in turn is in the same ring as the carbon (cyclic ester)
    const functionalGroups = context.getState().functionalGroups;
    const mol = context.getState().molecule;
    const rings = mol.rings || [];

    if (process.env.VERBOSE) {
      const esters = functionalGroups.filter((fg: any) => fg.type === 'ester');
      console.log('[LACTONE_TO_KETONE] Checking conditions: esters=', esters.length, 'rings=', rings.length);
    }

    if (!rings || rings.length === 0) {
      if (process.env.VERBOSE) console.log('[LACTONE_TO_KETONE] No rings in molecule');
      return false;
    }

    // Scan for carbonyl double bonds and check for an adjacent oxygen that is in the same ring
    for (const bond of mol.bonds) {
      if (bond.type !== 'double') continue;
      const a1 = mol.atoms[bond.atom1];
      const a2 = mol.atoms[bond.atom2];
      if (!isCarbonyl(a1, a2)) continue;
      const carbon = getCarbonFromCarbonyl(a1, a2);
      // find single-bonded oxygens attached to this carbon
      if (process.env.VERBOSE) console.log('[LACTONE_TO_KETONE] Examining carbonyl at', carbon.id);
      for (const b of mol.bonds) {
        if (b.type !== 'single') continue;
        const otherId = b.atom1 === carbon.id ? b.atom2 : (b.atom2 === carbon.id ? b.atom1 : undefined);
        if (otherId === undefined) continue;
        const otherAtom = mol.atoms[otherId];
        if (!otherAtom || otherAtom.symbol !== 'O') continue;
        if (process.env.VERBOSE) console.log('[LACTONE_TO_KETONE]  found single-bonded O at', otherId);

        // Check if carbon and this oxygen share a ring
        for (const ring of rings as any[]) {
          const ringSet = new Set(ring);
          if (ringSet.has(carbon.id) && ringSet.has(otherId)) {
            if (process.env.VERBOSE) console.log('[LACTONE_TO_KETONE] Lactone pattern detected at carbon', carbon.id, 'oxygen', otherId);
            return true;
          }
        }
      }
    }

    if (process.env.VERBOSE) console.log('[LACTONE_TO_KETONE] No lactone patterns found');
    return false;
  },
  action: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState().functionalGroups || [];
    const mol = context.getState().molecule;
    const rings = mol.rings || [];

    if (process.env.VERBOSE) {
      console.log('[LACTONE_TO_KETONE] Converting cyclic esters to ketones (if any)');
      console.log('[LACTONE_TO_KETONE] Current functionalGroups:', functionalGroups.map((fg: any) => ({ type: fg.type, atoms: fg.atoms?.map((a: any) => a.id || a) })));
    }

    // Find lactone carbonyls directly on the molecule (C=O with adjacent O in same ring)
  const ringAtomSets = (rings || []).map((r: readonly number[]) => new Set(r));
    const lactoneCarbonIds = new Set<number>();

    for (const bond of mol.bonds) {
      if (bond.type !== 'double') continue;
      const a1 = mol.atoms[bond.atom1];
      const a2 = mol.atoms[bond.atom2];
      if (!isCarbonyl(a1, a2)) continue;
      const carbon = getCarbonFromCarbonyl(a1, a2);

      // find single-bonded oxygen attached to carbon
      for (const b of mol.bonds) {
        if (b.type !== 'single') continue;
        const otherId = b.atom1 === carbon.id ? b.atom2 : (b.atom2 === carbon.id ? b.atom1 : undefined);
        if (otherId === undefined) continue;
        const otherAtom = mol.atoms[otherId];
        if (!otherAtom || otherAtom.symbol !== 'O') continue;

        // check if carbon and oxygen are in same ring
        for (const ringSet of ringAtomSets) {
          if (ringSet.has(carbon.id) && ringSet.has(otherId)) {
            lactoneCarbonIds.add(carbon.id);
            if (process.env.VERBOSE) console.log('[LACTONE_TO_KETONE] Detected lactone carbonyl at', carbon.id);
          }
        }
      }
    }

    // If we found any lactone carbonyls, ensure they're present as ketone functional groups
    let updatedFunctionalGroups = functionalGroups.slice();
    if (lactoneCarbonIds.size > 0) {
      // Remove any existing ester entries that correspond to these lactones and replace with ketone entries
      updatedFunctionalGroups = updatedFunctionalGroups.map((fg: any) => {
        if (fg.type === 'ester') {
          const fgAtomIds = (fg.atoms || []).map((a: any) => typeof a === 'number' ? a : (a?.id ?? -1));
          const carbonylId = fgAtomIds.length > 0 ? fgAtomIds[0] : undefined;
          if (carbonylId && lactoneCarbonIds.has(carbonylId)) {
            // convert to ketone FG
            return {
              ...fg,
              type: 'ketone',
              name: 'ketone',
              suffix: 'one',
              priority: FUNCTIONAL_GROUP_PRIORITIES.ketone,
              atoms: [mol.atoms.find((a: any) => a.id === carbonylId)],
              prefix: 'oxo',
              isPrincipal: false
            } as FunctionalGroup;
          }
        }
        return fg;
      });

      // For any lactone carbonyls not represented by an ester FG, add ketone FG entries
      for (const cid of Array.from(lactoneCarbonIds)) {
        const exists = updatedFunctionalGroups.some((fg: any) => fg.type === 'ketone' && (fg.atoms || []).some((a: any) => (a?.id || a) === cid));
        if (!exists) {
          const carbonAtom = mol.atoms.find((a: any) => a.id === cid);
          updatedFunctionalGroups.push({
            type: 'ketone',
            name: 'ketone',
            suffix: 'one',
            prefix: 'oxo',
            atoms: carbonAtom ? [carbonAtom] : [cid],
            bonds: [],
            priority: FUNCTIONAL_GROUP_PRIORITIES.ketone,
            isPrincipal: false,
            locants: carbonAtom ? [carbonAtom.id] : [cid]
          } as FunctionalGroup);
        }
      }
    }

    if (process.env.VERBOSE) {
      console.log('[LACTONE_TO_KETONE] After conversion/update, functionalGroups:', updatedFunctionalGroups.map((fg: any) => ({ type: fg.type, suffix: fg.suffix, atoms: fg.atoms?.map((a: any) => a.id || a) })));
    }

    return context.withStateUpdate(
      (state) => ({
        ...state,
        functionalGroups: updatedFunctionalGroups
      }),
      'lactone-to-ketone',
      'Lactone to Ketone Conversion',
      'P-66.1.1.4',
      ExecutionPhase.FUNCTIONAL_GROUP,
      'Converted cyclic esters (lactones) to ketones for heterocycle naming'
    );
  }
};

/**
 * Rule: Carboxylic Acid Detection
 * 
 * Highest priority functional group
 * Example: CH3COOH → acetic acid
 */
export const CARBOXYLIC_ACID_RULE: IUPACRule = {
  id: 'carboxylic-acid-detection',
  name: 'Carboxylic Acid Detection',
  description: 'Detect carboxylic acid functional groups',
  blueBookReference: 'P-44.1 - Principal characteristic groups',
  priority: RulePriority.TEN,  // 100 - Carboxylic acids have highest priority
  conditions: (context: ImmutableNamingContext) => context.getState().molecule.bonds.length > 0,
  action: (context: ImmutableNamingContext) => {
    const carboxylicAcids: FunctionalGroup[] = detectCarboxylicAcids(context);
    let updatedContext = context;
    if (carboxylicAcids.length > 0) {
      // Append to any existing functional groups instead of overwriting
      const existing = context.getState().functionalGroups || [];
      updatedContext = updatedContext.withFunctionalGroups(
        existing.concat(carboxylicAcids),
        'carboxylic-acid-detection',
        'Carboxylic Acid Detection',
        'P-44.1.1',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Detected carboxylic acid groups'
      );
      updatedContext = updatedContext.withStateUpdate(
        (state) => ({
          ...state,
          principalGroup: carboxylicAcids[0],
          functionalGroupPriority: (FUNCTIONAL_GROUP_PRIORITIES.carboxylic_acid || opsinDetector.getFunctionalGroupPriority('carboxylic_acid') || 0)
        }),
        'carboxylic-acid-detection',
        'Carboxylic Acid Detection',
        'P-44.1.1',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Set principal group to carboxylic acid and priority to 1'
      );
    }
    return updatedContext;
  }
};

/**
 * Rule: Alcohol Detection
 * 
 * Medium priority functional group
 * Example: CH3CH2OH → ethanol
 */
export const ALCOHOL_DETECTION_RULE: IUPACRule = {
  id: 'alcohol-detection',
  name: 'Alcohol Detection',
  description: 'Detect alcohol functional groups',
  blueBookReference: 'P-44.1 - Principal characteristic groups',
  priority: RulePriority.EIGHT,  // 80 - Alcohols detected early
  conditions: (context: ImmutableNamingContext) => context.getState().molecule.atoms.length > 0,
  action: (context: ImmutableNamingContext) => {
    const alcohols: FunctionalGroup[] = detectAlcohols(context);
    let updatedContext = context;
    if (alcohols.length > 0) {
      // Append alcohol detections to pre-existing functional groups
      const existing = context.getState().functionalGroups || [];
      updatedContext = updatedContext.withFunctionalGroups(
        existing.concat(alcohols),
        'alcohol-detection',
        'Alcohol Detection',
        'P-44.1.9',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Detected alcohol groups'
      );
    }
    return updatedContext;
  }
};

/**
 * Rule: Amine Detection
 * 
 * Medium priority functional group
 * Example: CH3NH2 → methanamine
 */
export const AMINE_DETECTION_RULE: IUPACRule = {
  id: 'amine-detection',
  name: 'Amine Detection',
  description: 'Detect amine functional groups',
  blueBookReference: 'P-44.1 - Principal characteristic groups',
  priority: RulePriority.SEVEN,  // 70 - Amines detected early
  conditions: (context: ImmutableNamingContext) => context.getState().molecule.atoms.length > 0,
  action: (context: ImmutableNamingContext) => {
    const amines: FunctionalGroup[] = detectAmines(context);
    let updatedContext = context;
    if (amines.length > 0) {
      // Append amine detections to pre-existing functional groups
      const existing = context.getState().functionalGroups || [];
      updatedContext = updatedContext.withFunctionalGroups(
        existing.concat(amines),
        'amine-detection',
        'Amine Detection',
        'P-44.1.10',
        ExecutionPhase.FUNCTIONAL_GROUP,
        'Detected amine groups'
      );
    }
    return updatedContext;
  }
};

/**
 * Rule: Ketone Detection
 * 
 * Medium priority functional group
 * Example: CH3COCH3 → propan-2-one
 */
export const KETONE_DETECTION_RULE: IUPACRule = {
  id: 'ketone-detection',
  name: 'Ketone Detection',
  description: 'Detect ketone groups (>C=O)',
  blueBookReference: 'P-44.1.8 - Ketones',
  priority: RulePriority.NINE,  // 90 - Run before alcohol (80) but after carboxylic acid (100)
  conditions: (context: ImmutableNamingContext) => context.getState().molecule.bonds.length > 0,
  action: (context: ImmutableNamingContext) => {
    const ketones: FunctionalGroup[] = detectKetones(context);
    let updatedContext = context;
    if (ketones.length > 0) {
        // Append ketone detections to pre-existing functional groups
        const existing = context.getState().functionalGroups || [];
        updatedContext = updatedContext.withFunctionalGroups(
          existing.concat(ketones),
          'ketone-detection',
          'Ketone Detection',
          'P-44.1.8',
          ExecutionPhase.FUNCTIONAL_GROUP,
          'Detected ketone groups'
        );
    }
    return updatedContext;
  }
};

/**
 * Functional group priority table (Blue Book Table 5.1)
 */
// Expanded functional group priority mapping
// NOTE: The engine uses numeric comparison where a higher numeric value means higher priority.
// Assign larger numbers to higher-priority functional groups to match comparator semantics.
const FUNCTIONAL_GROUP_PRIORITIES: Record<string, number> = {
  // Highest priority groups
  carboxylic_acid: 100,
  sulfonic_acid: 99,
  anhydride: 98,
  ester: 97,

  // High priority
  acyl_halide: 96,
  amide: 95,
  nitrile: 94,
  thiocyanate: 93,

  // Medium priority
  aldehyde: 92,
  ketone: 91,
  alcohol: 90,
  amine: 89,

  // Lower priority
  ether: 88,
  halide: 87,
  nitro: 86,
  peroxide: 85,
  isocyanate: 84,
  sulfoxide: 83,
  sulfide: 82
};

// Singleton OPSIN detector for the module
const opsinDetector = new OPSINFunctionalGroupDetector();

/**
 * Normalize detector-provided priorities to the engine's static scale.
 * OPSIN/other detectors often return small numbers (e.g., 1..12). The engine
 * uses larger static values (roughly 80..100). To compare fairly, rescale
 * small detector priorities into the static range. If a priority already
 * appears to be on the engine scale (>20) leave it unchanged.
 */
function normalizePriority(p: number): number {
  if (typeof p !== 'number' || Number.isNaN(p)) return 0;
  if (p > 20) return p; // assume already in engine scale
  const detectorMax = 12; // conservative assumed max for detector scale
  return Math.round((p / detectorMax) * 100);
}

/**
 * Detect all functional groups in the molecule
 */
function detectAllFunctionalGroups(context: any): FunctionalGroup[] {
  const mol = context.getState ? context.getState().molecule : context.molecule;
  const detected = opsinDetector.detectFunctionalGroups(mol || context.molecule);

    const normalized: FunctionalGroup[] = detected.map((d: any) => {
    const rawName = (d.name || d.type || d.pattern || '').toString().toLowerCase();
    const type = rawName.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const atoms = d.atoms || [];
    const bonds = d.bonds || [];
    const rawPriority2 = typeof d.priority === 'number'
      ? d.priority
      : (opsinDetector.getFunctionalGroupPriority(d.pattern || d.type) || FUNCTIONAL_GROUP_PRIORITIES[type] || 0);
    const priority = normalizePriority(rawPriority2);

    return {
      type,
      atoms,
      bonds,
      suffix: d.suffix || opsinDetector.getFunctionalGroupSuffix(d.pattern || d.type) || undefined,
      prefix: d.prefix || undefined,
      priority,
      isPrincipal: false,
      locants: atoms.map((a: any) => (a && typeof a.id === 'number') ? a.id : -1)
    } as FunctionalGroup;
  });

  // Sort descending: higher numeric value means higher priority
  normalized.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  return normalized;
}

/**
 * Select the principal functional group
 */
function selectPrincipalGroup(functionalGroups: any[]): any | null {
  if (functionalGroups.length === 0) {
    return null;
  }

  // Special-case: when both sulfinyl and sulfonyl are present prefer sulfinyl as principal
  // (sulfinyl should be treated as the principal characteristic group in linked S-O systems)
  const hasSulfinyl = functionalGroups.some((g: any) => g.type === 'sulfinyl');
  const hasSulfonyl = functionalGroups.some((g: any) => g.type === 'sulfonyl');
  if (hasSulfinyl && hasSulfonyl) {
    const sulfinylGroup = functionalGroups.find((g: any) => g.type === 'sulfinyl');
    if (sulfinylGroup) return sulfinylGroup;
  }

  // Special-case: For ring systems, ketones should take precedence over ethers
  // Ethers attached to rings should be named as alkoxy substituents (e.g., "methoxy")
  // while ketones should be the principal functional group (e.g., "cycloheptan-1-one")
  const hasKetone = functionalGroups.some((g: any) => g.type === 'ketone');
  const hasEther = functionalGroups.some((g: any) => g.type === 'ether');
  
  if (hasKetone && hasEther) {
    // Check if any ketone is in a ring (most ketones in rings should be principal)
    const ketoneInRing = functionalGroups.find((g: any) => 
      g.type === 'ketone' && g.atoms && g.atoms.some((atom: any) => atom.isInRing)
    );
    
    if (ketoneInRing) {
      if (process.env.VERBOSE) {
        console.log('[selectPrincipalGroup] Ring system detected: ketone takes precedence over ether');
      }
      return ketoneInRing;
    }
  }

  // Sort by the assigned priority on the FunctionalGroup object first (higher numeric value = higher priority)
  // Fall back to the static FUNCTIONAL_GROUP_PRIORITIES table or 0 when missing.
  const sortedGroups = functionalGroups.sort((a, b) => {
    const priorityA = (typeof a.priority === 'number') ? a.priority : (opsinDetector.getFunctionalGroupPriority(a.type) || FUNCTIONAL_GROUP_PRIORITIES[a.type as keyof typeof FUNCTIONAL_GROUP_PRIORITIES] || 0);
    const priorityB = (typeof b.priority === 'number') ? b.priority : (opsinDetector.getFunctionalGroupPriority(b.type) || FUNCTIONAL_GROUP_PRIORITIES[b.type as keyof typeof FUNCTIONAL_GROUP_PRIORITIES] || 0);
    return priorityB - priorityA;
  });

  return sortedGroups[0];
}

/**
 * Calculate functional group priority score
 */
function calculateFunctionalGroupPriority(functionalGroups: any[]): number {
  if (functionalGroups.length === 0) {
    return 0;
  }
  
  const principal = selectPrincipalGroup(functionalGroups);
  if (!principal) return 0;
  // Prefer the priority value stored on the principal FunctionalGroup object
  return (typeof principal.priority === 'number')
    ? principal.priority
    : (opsinDetector.getFunctionalGroupPriority(principal.type) || FUNCTIONAL_GROUP_PRIORITIES[principal.type as keyof typeof FUNCTIONAL_GROUP_PRIORITIES] || 0);
}

/**
 * Determine if functional class nomenclature is preferred
 * NOTE: This is now handled separately for esters in ESTER_DETECTION_RULE
 */
function isFunctionalClassPreferred(principalGroup: any): boolean {
  if (!principalGroup) {
    return false;
  }
  
  // Functional class is preferred for certain groups
  // Esters are NOT included here because complexity checking is done in ESTER_DETECTION_RULE
  const functionalClassPreferred = [
    'anhydride',
    'acyl_halide',
    'nitrile',
    'thioester',
    'thiocyanate'
  ];
  
  return functionalClassPreferred.includes(principalGroup.type);
}

/**
 * Detect carboxylic acid groups (-COOH)
 */
function detectCarboxylicAcids(context: any): any[] {
  const carboxylicAcids = [];
  const molecules = context.molecule;
  
  // Look for C=O bonds followed by O-H
  for (const bond of molecules.bonds) {
    if (bond.type === 'double') {
      const atom1 = molecules.atoms[bond.atom1];
      const atom2 = molecules.atoms[bond.atom2];
      
      if (isCarbonyl(atom1, atom2)) {
        // Check if attached to OH
        const carbon = getCarbonFromCarbonyl(atom1, atom2);
        const ohBond = findOHBond(carbon, molecules);
        
        if (ohBond) {
          carboxylicAcids.push({
            type: 'carboxylic_acid',
            atoms: [carbon, ohBond.atom1, ohBond.atom2],
            bonds: [bond, ohBond],
            suffix: 'oic acid',
            priority: FUNCTIONAL_GROUP_PRIORITIES.carboxylic_acid,
            isPrincipal: false
          });
        }
      }
    }
  }
  
  return carboxylicAcids;
}

/**
 * Detect alcohol groups (-OH)
 */
function detectAlcohols(context: any): any[] {
  const alcohols = [];
  const molecules = context.molecule;
  
  for (const atom of molecules.atoms) {
    if (atom.symbol === 'O') {
      const bonds = molecules.bonds.filter((b: any) => 
        (b.atom1 === atom.id || b.atom2 === atom.id) && b.type === 'single'
      );
      
      // Check if oxygen is bonded to carbon and has one hydrogen
      const carbonBonds = bonds.filter((b: any) => {
        const otherAtom = b.atom1 === atom.id ? molecules.atoms[b.atom2] : molecules.atoms[b.atom1];
        return otherAtom.symbol === 'C';
      });
      
      const hydrogenBonds = bonds.filter((b: any) => {
        const otherAtom = b.atom1 === atom.id ? molecules.atoms[b.atom2] : molecules.atoms[b.atom1];
        return otherAtom.symbol === 'H';
      });
      
      if (carbonBonds.length === 1 && hydrogenBonds.length === 1) {
        alcohols.push({
          type: 'alcohol',
          atoms: [atom],
          bonds: bonds,
          suffix: 'ol',
          prefix: 'hydroxy',
          priority: FUNCTIONAL_GROUP_PRIORITIES.alcohol,
          isPrincipal: false
        });
      }
    }
  }
  
  return alcohols;
}

/**
 * Detect amine groups (-NH2, -NHR, -NR2)
 */
function detectAmines(context: any): any[] {
  const amines = [];
  const molecules = context.molecule;
  
  for (const atom of molecules.atoms) {
    if (atom.symbol === 'N') {
      const bonds = molecules.bonds.filter((b: any) => 
        (b.atom1 === atom.id || b.atom2 === atom.id) && b.type === 'single'
      );
      
      const carbonBonds = bonds.filter((b: any) => {
        const otherAtom = b.atom1 === atom.id ? molecules.atoms[b.atom2] : molecules.atoms[b.atom1];
        return otherAtom.symbol === 'C';
      });
      
      const hydrogenBonds = bonds.filter((b: any) => {
        const otherAtom = b.atom1 === atom.id ? molecules.atoms[b.atom2] : molecules.atoms[b.atom1];
        return otherAtom.symbol === 'H';
      });
      
      if (carbonBonds.length > 0) {
        amines.push({
          type: 'amine',
          atoms: [atom],
          bonds: bonds,
          suffix: 'amine',
          prefix: 'amino',
          priority: FUNCTIONAL_GROUP_PRIORITIES.amine,
          isPrincipal: false
        });
      }
    }
  }
  
  return amines;
}

/**
 * Detect ketone groups (>C=O)
 */
function detectKetones(context: any): any[] {
  const ketones = [];
  const molecules = context.molecule;
  
  for (const bond of molecules.bonds) {
    if (bond.type === 'double') {
      const atom1 = molecules.atoms[bond.atom1];
      const atom2 = molecules.atoms[bond.atom2];
      
      if (isCarbonyl(atom1, atom2)) {
        // Check if the carbon is not part of carboxylic acid
        const carbon = getCarbonFromCarbonyl(atom1, atom2);
        
        // Simple heuristic: if carbon has two other carbon bonds, it's likely a ketone
        const carbonBonds = molecules.bonds.filter((b: any) => 
          (b.atom1 === carbon.id || b.atom2 === carbon.id) && b.type === 'single'
        );
        
        const carbonAtomBonds = carbonBonds.filter((b: any) => {
          const otherAtom = b.atom1 === carbon.id ? molecules.atoms[b.atom2] : molecules.atoms[b.atom1];
          return otherAtom.symbol === 'C';
        });
        
        if (carbonAtomBonds.length === 2) {
          ketones.push({
            type: 'ketone',
            atoms: [carbon, atom1, atom2],
            bonds: [bond],
            suffix: 'one',
            prefix: 'oxo',
            priority: FUNCTIONAL_GROUP_PRIORITIES.ketone,
            isPrincipal: false
          });
        }
      }
    }
  }
  
  return ketones;
}

/**
 * Detect ester groups (-COOR)
 */
function detectEsters(context: any): any[] {
  const esters = [];
  const molecules = context.molecule;
  
  // Look for carboxylic acid oxygen bonded to carbon (R-O-C=O)
  const carboxylicAcids = detectCarboxylicAcids(context);
  
  for (const acid of carboxylicAcids) {
    // Find the oxygen not bonded to hydrogen
    const oxygens = acid.atoms.filter((a: any) => a.symbol === 'O');
    
    for (const oxygen of oxygens) {
      const bonds = molecules.bonds.filter((b: any) => 
        (b.atom1 === oxygen.id || b.atom2 === oxygen.id) && b.type === 'single'
      );
      
      const carbonBonds = bonds.filter((b: any) => {
        const otherAtom = b.atom1 === oxygen.id ? molecules.atoms[b.atom2] : molecules.atoms[b.atom1];
        return otherAtom.symbol === 'C';
      });
      
      if (carbonBonds.length > 0) {
        esters.push({
          type: 'ester',
          atoms: acid.atoms.concat(carbonBonds.map((b: any) => 
            b.atom1 === oxygen.id ? molecules.atoms[b.atom2] : molecules.atoms[b.atom1]
          )),
          bonds: acid.bonds.concat(carbonBonds),
          priority: FUNCTIONAL_GROUP_PRIORITIES.ester,
          isPrincipal: false
        });
      }
    }
  }
  
  return esters;
}

/**
 * Helper functions
 */
function isCarbonyl(atom1: any, atom2: any): boolean {
  return (atom1.symbol === 'C' && atom2.symbol === 'O') || 
         (atom2.symbol === 'C' && atom1.symbol === 'O');
}

function getCarbonFromCarbonyl(atom1: any, atom2: any): any {
  return atom1.symbol === 'C' ? atom1 : atom2;
}

function findOHBond(carbon: any, molecules: any): any | null {
  for (const bond of molecules.bonds) {
    if (bond.atom1 === carbon.id || bond.atom2 === carbon.id) {
      const otherAtom = bond.atom1 === carbon.id ? molecules.atoms[bond.atom2] : molecules.atoms[bond.atom1];
      if (otherAtom.symbol === 'O') {
        // Check for H bonded to O
        for (const bond2 of molecules.bonds) {
          if ((bond2.atom1 === otherAtom.id || bond2.atom2 === otherAtom.id)) {
            const otherAtom2 = bond2.atom1 === otherAtom.id ? molecules.atoms[bond2.atom2] : molecules.atoms[bond2.atom1];
            if (otherAtom2.symbol === 'H') {
              return bond2;
            }
          }
        }
      }
    }
  }
  return null;
}

/**
 * Rule: Convert Ethers to Alkoxy Substituents
 * 
 * When an ether is NOT the principal functional group, it should be named as an alkoxy substituent
 * (methoxy, ethoxy, propoxy, etc.) rather than "ether"
 * 
 * Example: COC1CCCC(=O)CC1 → 4-methoxycycloheptan-1-one (not "4-ether...")
 */
export const ETHER_TO_ALKOXY_RULE: IUPACRule = {
  id: 'ether-to-alkoxy-conversion',
  name: 'Convert Ethers to Alkoxy Substituents',
  description: 'Convert non-principal ethers to alkoxy substituent names (methoxy, ethoxy, propoxy)',
  blueBookReference: 'P-63.2.2 - Ethers as substituents',
  priority: RulePriority.THREE,  // 30 - Runs late, after lactone conversion (40)
  conditions: (context: ImmutableNamingContext) => {
    const functionalGroups = context.getState().functionalGroups;
    const principalGroup = context.getState().principalGroup;
    const hasEther = functionalGroups.some(g => g.type === 'ether' && (!principalGroup || g.type !== principalGroup.type));
    
    return hasEther;
  },
  action: (context: ImmutableNamingContext) => {
    const mol = context.getState().molecule;
    const functionalGroups = context.getState().functionalGroups;
    const principalGroup = context.getState().principalGroup;

    const updatedGroups = functionalGroups.map(fg => {
      // Only convert ethers that are NOT the principal group
      if (fg.type === 'ether' && (!principalGroup || fg.type !== principalGroup.type)) {
        const oxygenAtom = fg.atoms[0]; // Ether detection returns [oxygenAtom]
        if (!oxygenAtom) return fg;

        // Find the two carbon atoms bonded to the oxygen
        const carbonBonds = mol.bonds.filter((bond: any) =>
          (bond.atom1 === oxygenAtom.id || bond.atom2 === oxygenAtom.id) && bond.type === 'single'
        );

        const bondedCarbons = carbonBonds
          .map((bond: any) => {
            const otherId = bond.atom1 === oxygenAtom.id ? bond.atom2 : bond.atom1;
            return mol.atoms.find((a: any) => a.id === otherId);
          })
          .filter((a: any) => a && a.symbol === 'C');

        if (bondedCarbons.length !== 2) return fg;

        // Determine which carbon is part of the parent chain and which is the substituent
        // For now, use a simple heuristic: the substituent is the smaller alkyl group
        const alkoxyName = analyzeAlkoxySubstituent(mol, oxygenAtom, bondedCarbons);

        return {
          ...fg,
          type: 'alkoxy',
          prefix: alkoxyName
        };
      }
      return fg;
    });

    return context.withFunctionalGroups(
      updatedGroups,
      'ether-to-alkoxy-conversion',
      'Convert Ethers to Alkoxy Substituents',
      'P-63.2.2',
      ExecutionPhase.FUNCTIONAL_GROUP,
      'Converted non-principal ethers to alkoxy substituents'
    );
  }
};

/**
 * Analyze an ether oxygen to determine the alkoxy substituent name
 * Returns: 'methoxy', 'ethoxy', 'propoxy', etc., or complex names for nested ethers
 */
function analyzeAlkoxySubstituent(mol: any, oxygenAtom: any, bondedCarbons: any[]): string {
  if (bondedCarbons.length !== 2) return 'oxy';

  // Analyze each carbon chain to determine which is the substituent
  const chain1Info = getAlkylChainInfo(mol, bondedCarbons[0], oxygenAtom);
  const chain2Info = getAlkylChainInfo(mol, bondedCarbons[1], oxygenAtom);

  // The smaller chain is the alkoxy substituent
  const substituent = chain1Info.carbonCount <= chain2Info.carbonCount ? chain1Info : chain2Info;

  // Check if there are nested oxygens in the substituent
  if (substituent.hasNestedOxygen) {
    // For now, mark as complex - will be handled in naming phase
    return 'complex-alkoxy';
  }

  // Map chain length to alkoxy name
  const alkoxyNames: Record<number, string> = {
    1: 'methoxy',
    2: 'ethoxy',
    3: 'propoxy',
    4: 'butoxy',
    5: 'pentoxy',
    6: 'hexoxy',
    7: 'heptoxy',
    8: 'octoxy'
  };

  return alkoxyNames[substituent.carbonCount] || 'oxy';
}

/**
 * Get information about an alkyl chain starting from a carbon atom
 * Detects nested oxygens and returns both carbon count and nested oxygen status
 */
function getAlkylChainInfo(mol: any, startCarbon: any, oxygenAtom: any): { carbonCount: number; hasNestedOxygen: boolean; atoms: any[] } {
  const visited = new Set<number>([oxygenAtom.id]);
  const chain: any[] = [];
  let hasNestedOxygen = false;

  function traverse(atom: any): void {
    if (visited.has(atom.id)) return;
    
    // If we encounter another oxygen, mark it
    if (atom.symbol === 'O') {
      hasNestedOxygen = true;
      visited.add(atom.id);
      
      // Continue traversing through the oxygen to count all carbons
      const oxygenBonds = mol.bonds.filter((bond: any) => {
        if (bond.atom1 !== atom.id && bond.atom2 !== atom.id) return false;
        const otherId = bond.atom1 === atom.id ? bond.atom2 : bond.atom1;
        return !visited.has(otherId);
      });
      
      for (const bond of oxygenBonds) {
        const otherId = bond.atom1 === atom.id ? bond.atom2 : bond.atom1;
        const otherAtom = mol.atoms.find((a: any) => a.id === otherId);
        if (otherAtom) {
          traverse(otherAtom);
        }
      }
      return;
    }
    
    if (atom.symbol !== 'C') return;

    visited.add(atom.id);
    chain.push(atom);

    // Find all single bonds to other atoms
    const bonds = mol.bonds.filter((bond: any) => {
      if (bond.type !== 'single') return false;
      if (bond.atom1 !== atom.id && bond.atom2 !== atom.id) return false;

      const otherId = bond.atom1 === atom.id ? bond.atom2 : bond.atom1;
      return !visited.has(otherId);
    });

    for (const bond of bonds) {
      const otherId = bond.atom1 === atom.id ? bond.atom2 : bond.atom1;
      const otherAtom = mol.atoms.find((a: any) => a.id === otherId);
      if (otherAtom) {
        traverse(otherAtom);
      }
    }
  }

  traverse(startCarbon);
  return { carbonCount: chain.length, hasNestedOxygen, atoms: chain };
}

/**
 * Legacy function for backward compatibility
 */
function getAlkylChainLength(mol: any, startCarbon: any, oxygenAtom: any): any[] {
  const info = getAlkylChainInfo(mol, startCarbon, oxygenAtom);
  return info.atoms;
}

/**
 * Export all functional group layer rules
 */
export const FUNCTIONAL_GROUP_LAYER_RULES: IUPACRule[] = [
  CARBOXYLIC_ACID_RULE,
  KETONE_DETECTION_RULE,
  ALCOHOL_DETECTION_RULE,
  AMINE_DETECTION_RULE,
  ESTER_DETECTION_RULE,
  LACTONE_TO_KETONE_RULE,  // Convert cyclic esters to ketones
  FUNCTIONAL_GROUP_PRIORITY_RULE,
  ETHER_TO_ALKOXY_RULE,
  FUNCTIONAL_CLASS_RULE
];