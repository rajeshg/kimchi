import type { IUPACRule } from '../../types';
import { BLUE_BOOK_RULES, RulePriority } from '../../types';
import type { ImmutableNamingContext } from '../../immutable-context';
import { ExecutionPhase } from '../../immutable-context';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { findSubstituents: _findSubstituents } = require('../../naming/iupac-chains');

/**
 * Rule: P-44.2 - Ring System Seniority
 * 
 * Prefer ring systems over chains when applicable.
 */
export const P44_2_RING_SENIORITY_RULE: IUPACRule = {
  id: 'P-44.2',
  name: 'Ring System Seniority',
  description: 'Prefer ring systems over chains when applicable',
  blueBookReference: BLUE_BOOK_RULES.P44_2,
  priority: RulePriority.TEN,
   conditions: (context) => {
    const state = context.getState();
    // Skip if parent structure already selected
    if (state.parentStructure) {
      return false;
    }
    const rings = state.candidateRings;
    return rings && rings.length > 0;
  },
  action: (context) => {
    const state = context.getState();
    const rings = state.candidateRings;
    if (!rings || rings.length === 0) return context;
    
    const molecule = (state as any).molecule;
    const functionalGroups = state.functionalGroups || [];
    
    // Get principal functional groups (highest priority groups like carboxylic acids, ketones, etc.)
    const principalFGs = functionalGroups.filter((fg: any) => fg.isPrincipal);
    
    // For each ring, count how many principal functional groups are attached
    const ringFGScores = rings.map(ring => {
      const ringAtomIds = new Set(ring.atoms.map((a: any) => a.id));
      
      let fgCount = 0;
      let highestPriority = Infinity;
      
      for (const fg of principalFGs) {
        // Check if any FG atom is in the ring
        const fgInRing = (fg.atoms || []).some((atom: any) => ringAtomIds.has(atom.id));
        
        // Check if any FG atom is bonded to a ring atom
        let fgAttachedToRing = false;
        if (!fgInRing && molecule) {
          for (const fgAtom of (fg.atoms || [])) {
            const bonds = molecule.bonds.filter((b: any) => 
              b.atom1 === fgAtom.id || b.atom2 === fgAtom.id
            );
            
            for (const bond of bonds) {
              const neighborId = bond.atom1 === fgAtom.id ? bond.atom2 : bond.atom1;
              if (ringAtomIds.has(neighborId)) {
                fgAttachedToRing = true;
                break;
              }
            }
            if (fgAttachedToRing) break;
          }
        }
        
        if (fgInRing || fgAttachedToRing) {
          fgCount++;
          // Track highest priority (lowest number = highest priority)
          if (fg.priority < highestPriority) {
            highestPriority = fg.priority;
          }
        }
      }
      
      return { ring, fgCount, highestPriority, size: ring.atoms.length };
    });
    
    // Sort rings by:
    // 1. Number of functional groups (descending)
    // 2. Priority of highest functional group (ascending - lower number = higher priority)
    // 3. Ring size (descending)
    ringFGScores.sort((a, b) => {
      if (a.fgCount !== b.fgCount) return b.fgCount - a.fgCount;
      if (a.highestPriority !== b.highestPriority) return a.highestPriority - b.highestPriority;
      return b.size - a.size;
    });
    
    const ring = ringFGScores[0]?.ring;
    if (!ring) return context;
    const size = ring.atoms ? ring.atoms.length : (ring.size || 0);
    const type = ring.type || (ring.atoms && ring.atoms.some((a:any) => a.aromatic) ? 'aromatic' : 'aliphatic');
    let name = '';
    if (type === 'aromatic') {
      const aromaticNames: { [key: number]: string } = { 6: 'benzene', 5: 'cyclopentadiene', 7: 'cycloheptatriene' };
      name = aromaticNames[size] || `aromatic-${size}-membered`;
    } else {
      const ringNames: { [key: number]: string } = { 3: 'cyclopropane', 4: 'cyclobutane', 5: 'cyclopentane', 6: 'cyclohexane', 7: 'cycloheptane', 8: 'cyclooctane' };
      name = ringNames[size] || `cyclo${size}ane`;
    }
    const locants = ring.atoms ? ring.atoms.map((_: any, idx: number) => idx + 1) : [];
    // Try to find substituents on the ring atoms so substituted ring names can be produced
    let substituents: any[] = [];
    try {
      const mol = (context.getState() as any).molecule;
      if (ring && ring.atoms && mol) {
        const atomIds = ring.atoms.map((a: any) => a.id);
        substituents = _findSubstituents(mol, atomIds) || [];
      }
    } catch (e) {
      substituents = [];
    }

    const parentStructure = {
      type: 'ring' as const,
      ring,
      name,
      locants,
      substituents
    };
    return context.withParentStructure(
      parentStructure,
      'P-44.2',
      'Ring System Seniority',
      BLUE_BOOK_RULES.P44_2,
      ExecutionPhase.PARENT_STRUCTURE,
      'Selected largest ring system as parent structure'
    );
  }
};
