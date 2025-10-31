/**
 * Blue Book Rule P-3: Substituents
 *
 * Reference: IUPAC Blue Book 2013, Section P-3
 * https://iupac.qmul.ac.uk/BlueBook/P3.html
 *
 * Description: Rules for substituent groups and prefixes in substitutive nomenclature.
 * This includes detection and naming of substituents attached to parent structures.
 */

import { ImmutableNamingContext, ExecutionPhase } from '../../../immutable-context';
import type { IUPACRule } from '../../../types';

/**
 * Rule P-3.1: Heteroatom Parent Substituent Detection
 *
 * Detects and names substituents attached to heteroatom parent hydrides.
 * For example, in [SiH3]CH3, detects the methyl substituent on silane.
 */
export const P3_1_HETEROATOM_SUBSTITUENT_RULE: IUPACRule = {
  id: 'P-3.1',
  name: 'Heteroatom Parent Substituent Detection',
  description: 'Detect substituents attached to heteroatom parent hydrides',
  blueBookReference: 'P-3.1 - Substituent detection for heteroatom parents',
  priority: 140, // Run after P-2.1 parent selection (priority 150)
  conditions: (context: ImmutableNamingContext) => {
    const parentStructure = context.getState().parentStructure;
    if (process.env.VERBOSE) {
      console.log('[P-3.1] Checking conditions: parentStructure=', parentStructure?.type);
    }
    return parentStructure?.type === 'heteroatom';
  },
  action: (context: ImmutableNamingContext) => {
    const molecule = context.getState().molecule;
    const parentStructure = context.getState().parentStructure;

    if (process.env.VERBOSE) {
      console.log('[P-3.1] Action running for heteroatom parent:', parentStructure);
    }

    if (!parentStructure || parentStructure.type !== 'heteroatom') {
      return context;
    }

    const heteroatom = parentStructure.heteroatom;
    const heteroatomIndex = molecule.atoms.indexOf(heteroatom!);

    // Find bonds connected to the heteroatom
    const connectedBonds = molecule.bonds.filter(bond =>
      bond.atom1 === heteroatomIndex || bond.atom2 === heteroatomIndex
    );

    const substituents: any[] = [];

    for (const bond of connectedBonds) {
      const otherAtomIndex = bond.atom1 === heteroatomIndex ? bond.atom2 : bond.atom1;
      const otherAtom = molecule.atoms[otherAtomIndex];

      if (!otherAtom) continue;

      // Skip hydrogen atoms (they're part of the hydride)
      if (otherAtom.symbol === 'H') continue;

      // Determine substituent name based on the attached atom/group
      const substituentName = getSubstituentName(otherAtom, molecule, heteroatomIndex);

      if (substituentName) {
        substituents.push({
          name: substituentName,
          locant: '', // For heteroatoms, locants are not used in simple cases
          atoms: [otherAtom],
          bond: bond
        });
      }
    }

    // Update parent structure with substituents
    const updatedParentStructure = {
      ...parentStructure,
      substituents: substituents
    };

    return context.withStateUpdate(
      (state: any) => ({
        ...state,
        parentStructure: updatedParentStructure
      }),
      'P-3.1',
      'Heteroatom Parent Substituent Detection',
      'P-3.1',
      ExecutionPhase.PARENT_STRUCTURE,
      `Detected ${substituents.length} substituent(s) on heteroatom parent`
    );
  }
};

/**
 * Helper function to determine substituent name from attached atom
 */
function getSubstituentName(attachedAtom: any, molecule: any, fromIndex: number): string | null {
  if (!attachedAtom) return null;

  const symbol = attachedAtom.symbol;

  // Carbon-based substituents
  if (symbol === 'C') {
    // Traverse the substituent chain starting from this carbon
    const substituentChain = traverseSubstituentChain(attachedAtom, molecule, fromIndex);

    if (substituentChain.length === 1) {
      // Single carbon substituents
      const atom = substituentChain[0];
      const hydrogens = atom.hydrogens || 0;
      switch (hydrogens) {
        case 3: return 'methyl';
        case 2: return 'methylene';
        case 1: return 'methine';
        case 0: return 'carbon';
        default: return null;
      }
    } else if (substituentChain.length === 2) {
      // Two carbon substituents
      return 'ethyl';
    } else if (substituentChain.length === 3) {
      // Three carbon substituents
      return 'propyl';
    } else if (substituentChain.length === 4) {
      // Four carbon substituents
      return 'butyl';
    } else if (substituentChain.length === 5) {
      // Five carbon substituents
      return 'pentyl';
    } else if (substituentChain.length === 6) {
      // Six carbon substituents
      return 'hexyl';
    }
    // For longer chains, could implement more complex logic
  }

  // Aromatic substituents
  if (symbol === 'C' && attachedAtom.aromatic) {
    // Check if it's a phenyl group (benzene ring)
    const ringAtoms = findRingContainingAtom(attachedAtom, molecule);
    if (ringAtoms && ringAtoms.length === 6) {
      // Check if all ring atoms are carbon
      const allCarbon = ringAtoms.every((atom: any) => atom.symbol === 'C');
      if (allCarbon) {
        return 'phenyl';
      }
    }
  }

  // Other common substituents
  if (symbol === 'F') return 'fluoro';
  if (symbol === 'Cl') return 'chloro';
  if (symbol === 'Br') return 'bromo';
  if (symbol === 'I') return 'iodo';
  if (symbol === 'O' && attachedAtom.hydrogens === 1) return 'hydroxy';
  if (symbol === 'N' && attachedAtom.hydrogens === 2) return 'amino';

  // For now, return null for unrecognized substituents
  return null;
}

/**
 * Traverse a substituent chain starting from an attached atom
 */
function traverseSubstituentChain(startAtom: any, molecule: any, excludeIndex: number): any[] {
  const visited = new Set<number>();
  const chain: any[] = [];

  function dfs(atom: any, fromIndex: number): void {
    const atomIndex = molecule.atoms.indexOf(atom);
    if (visited.has(atomIndex)) return;

    visited.add(atomIndex);
    chain.push(atom);

    // Find connected atoms (excluding the one we came from and the heteroatom)
    const connectedBonds = molecule.bonds.filter((bond: any) =>
      (bond.atom1 === atomIndex || bond.atom2 === atomIndex) &&
      (bond.atom1 !== fromIndex && bond.atom2 !== fromIndex) &&
      (bond.atom1 !== excludeIndex && bond.atom2 !== excludeIndex)
    );

    for (const bond of connectedBonds) {
      const nextIndex = bond.atom1 === atomIndex ? bond.atom2 : bond.atom1;
      const nextAtom = molecule.atoms[nextIndex];

      // Only traverse carbon chains for now
      if (nextAtom.symbol === 'C' && !visited.has(nextIndex)) {
        dfs(nextAtom, atomIndex);
      }
    }
  }

  dfs(startAtom, excludeIndex);
  return chain;
}

/**
 * Find ring containing a given atom
 */
function findRingContainingAtom(atom: any, molecule: any): any[] | null {
  const atomIndex = molecule.atoms.indexOf(atom);

  // Simple ring detection - check if atom is in any ring
  if (molecule.rings) {
    for (const ring of molecule.rings) {
      if (ring.includes(atomIndex)) {
        return ring.map((i: number) => molecule.atoms[i]);
      }
    }
  }

  return null;
}

/**
 * Rule P-3.2: Ring Parent Substituent Detection
 *
 * Detects and names substituents attached to ring parent structures.
 * For example, in C1CCCCC1 with a methyl group, detects the methyl substituent on cyclohexane.
 */
export const P3_2_RING_SUBSTITUENT_RULE: IUPACRule = {
  id: 'P-3.2',
  name: 'Ring Parent Substituent Detection',
  description: 'Detect substituents attached to ring parent structures',
  blueBookReference: 'P-3.2 - Substituent detection for ring parents',
  priority: 155, // Run after ring numbering
  conditions: (context: ImmutableNamingContext) => {
    const parentStructure = context.getState().parentStructure;
    return parentStructure?.type === 'ring';
  },
  action: (context: ImmutableNamingContext) => {
    const molecule = context.getState().molecule;
    const parentStructure = context.getState().parentStructure;

    if (!parentStructure || parentStructure.type !== 'ring' || !parentStructure.ring) {
      return context;
    }

    const ring = parentStructure.ring;
    const ringAtomIds = new Set(ring.atoms.map((atom: any) => atom.id));

    console.log(`[P-3.2] Ring atom IDs in order: [${ring.atoms.map((a: any) => a.id).join(', ')}]`);

    const substituents: any[] = [];

    for (const ringAtom of ring.atoms) {
      if (!ringAtom || typeof ringAtom.id !== 'number') continue;

      // Find bonds from this ring atom to non-ring atoms
      const bonds = molecule.bonds.filter((bond: any) =>
        (bond.atom1 === ringAtom.id || bond.atom2 === ringAtom.id)
      );

      for (const bond of bonds) {
        const otherAtomId = bond.atom1 === ringAtom.id ? bond.atom2 : bond.atom1;
        if (!ringAtomIds.has(otherAtomId)) {
          // This is a substituent attached to the ring
          const substituentAtom = molecule.atoms[otherAtomId];
          if (substituentAtom && substituentAtom.symbol !== 'H') {
            // Determine substituent type
            const substituentName = getRingSubstituentName(substituentAtom, molecule, ringAtom.id);

            const position = ring.atoms.indexOf(ringAtom) + 1; // 1-based position
            console.log(`[P-3.2] Detected substituent: ${substituentName} at ringAtom.id=${ringAtom.id}, indexOf=${ring.atoms.indexOf(ringAtom)}, position=${position}`);

            if (substituentName) {
              substituents.push({
                name: substituentName,
                type: substituentName,
                locant: position,
                position: position,
                atoms: [substituentAtom],
                bond: bond
              });
            }
          }
        }
      }
    }

    // Update parent structure with substituents
    const updatedParentStructure = {
      ...parentStructure,
      substituents: substituents
    };

    return context.withStateUpdate(
      (state: any) => ({
        ...state,
        parentStructure: updatedParentStructure
      }),
      'P-3.2',
      'Ring Parent Substituent Detection',
      'P-3.2',
      ExecutionPhase.PARENT_STRUCTURE,
      `Detected ${substituents.length} substituent(s) on ring parent`
    );
  }
};

/**
 * Helper function to determine substituent name for ring attachments
 */
function getRingSubstituentName(attachedAtom: any, molecule: any, fromIndex: number): string | null {
  if (!attachedAtom) return null;

  const symbol = attachedAtom.symbol;

  // Carbon-based substituents
  if (symbol === 'C') {
    // Traverse the substituent chain starting from this carbon
    const substituentChain = traverseSubstituentChain(attachedAtom, molecule, fromIndex);

    console.log(`[P-3.2] Substituent chain length: ${substituentChain.length}`);

    if (substituentChain.length === 1) {
      // Single carbon substituents
      const atom = substituentChain[0];
      const hydrogens = atom.hydrogens || 0;
      switch (hydrogens) {
        case 3: return 'methyl';
        case 2: return 'methylene';
        case 1: return 'methine';
        case 0: return 'carbon';
        default: return null;
      }
    } else if (substituentChain.length === 2) {
      // Two carbon substituents
      return 'ethyl';
    } else if (substituentChain.length === 3) {
      // Three carbon substituents
      return 'propyl';
    } else if (substituentChain.length === 4) {
      // Four carbon substituents
      return 'butyl';
    } else if (substituentChain.length === 5) {
      // Five carbon substituents
      return 'pentyl';
    } else if (substituentChain.length === 6) {
      // Six carbon substituents
      return 'hexyl';
    }
    // For longer chains, could implement more complex logic
  }

  // Halogens
  if (symbol === 'F') return 'fluoro';
  if (symbol === 'Cl') return 'chloro';
  if (symbol === 'Br') return 'bromo';
  if (symbol === 'I') return 'iodo';

  // Other common substituents
  if (symbol === 'O' && attachedAtom.hydrogens === 1) return 'hydroxy';
  if (symbol === 'N' && attachedAtom.hydrogens === 2) return 'amino';

  return null;
}

/**
 * Export all P-3 substituent rules
 */
export const P3_SUBSTITUENT_RULES: IUPACRule[] = [
  P3_1_HETEROATOM_SUBSTITUENT_RULE,
  P3_2_RING_SUBSTITUENT_RULE,
];