import type { Molecule } from 'types';
import { parseSMILES } from 'index';

// Fusion component template as used in OPSIN
export interface FusionTemplate {
  name: string;
  smiles: string;
  labels: string[]; // locant labels corresponding to SMILES atom order
  aliases?: string[];
  addHeteroAtom?: {
    symbol: string;
    defaultLocant: string;
  }[];
  frontLocantsExpected?: string[];
  fusedRingNumbering?: string[];
}

// Parsed fusion template with molecule and locant mapping
export interface ParsedFusionTemplate {
  template: FusionTemplate;
  molecule: Molecule;
  locantMap: Map<number, string>; // atom index in molecule -> locant string
}

// Database of fusion templates (subset from OPSIN)
export const FUSION_TEMPLATES: FusionTemplate[] = [
  {
    name: 'naphthaleno',
    smiles: 'c1ccc2ccccc2c1',
    labels: ['1', '2', '3', '4a', '4', '5', '6', '7', '8a', '8'],
    aliases: ['naphthalino', 'naphth', 'naphtho']
  },
  {
    name: 'anthraceno',
    smiles: 'c1cccc2c3ccccc3ccc12',
    labels: ['1', '2', '3', '4', '4a', '4b', '5', '6', '7', '8', '8a', '9', '10', '10a'],
    aliases: ['anthra']
  },
  {
    name: 'phenanthreno',
    smiles: 'c1cccc2c3ccccc3ccc12',
    labels: ['1', '2', '3', '3a', '4', '5', '5a', '6', '7', '8', '8a', '9', '10', '10a'],
    aliases: []
  },
  {
    name: 'pyreno',
    smiles: 'c1ccc2ccc3cccc4ccc1c2c34',
    labels: ['1', '2', '3', '3a', '4', '5', '5a', '6', '7', '8', '8a', '9', '10', '10a', '10b', '10c'],
    aliases: []
  },
  {
    name: 'chryseno',
    smiles: 'c1cccc2c3ccc4ccccc4c3ccc12',
    labels: ['1', '2', '3', '4', '4a', '4b', '5', '6', '6a', '7', '8', '9', '10', '10a', '10b', '11', '12', '12a'],
    aliases: []
  },
  {
    name: 'acridino',
    smiles: 'c1cccc2nc3ccccc3cc12',
    labels: ['1', '2', '3', '4', '4a', '10', '10a', '5', '6', '7', '8', '8a', '9', '9a'],
    aliases: []
  },
   {
     name: 'indole',
     smiles: 'c1ccc2c(c1)[n]cc2',
     labels: ['8a', '8', '7', '6', '5', '4', '4a', '1', '2', '3'],
     aliases: []
   },
  {
    name: 'quinolino',
    smiles: 'n1cccc2ccccc12',
    labels: ['1', '2', '3', '4', '4a', '5', '6', '7', '8', '8a'],
    aliases: ['quino']
  },
  {
    name: 'isoquinolino',
    smiles: 'c1nccc2ccccc12',
    labels: ['1', '2', '3', '4', '4a', '5', '6', '7', '8', '8a'],
    aliases: ['isoquino']
  },
  {
    name: 'carbazol',
    smiles: 'c1cccc2c3ccccc3[nH]c12',
    labels: ['1', '2', '3', '4', '4a', '4b', '5', '6', '7', '8', '8a', '9', '9a'],
    aliases: []
  },
  {
    name: 'fluoreno',
    smiles: 'c1cccc2c3ccccc3[cH2]c12',
    labels: ['1', '2', '3', '4', '4a', '4b', '5', '6', '7', '8', '8a', '9', '9a'],
    aliases: []
  },
  {
    name: 'xantheno',
    smiles: 'c1cccc2oc3ccccc3[cH2]c12',
    labels: ['1', '2', '3', '4', '4a', '10', '10a', '5', '6', '7', '8', '8a', '9', '9a'],
    aliases: []
  },
  // Add more templates as needed
];

/**
  * Find a matching fusion template for a given fused system
  * This is a simplified matcher - in practice, would need more sophisticated
  * graph isomorphism or canonical labeling comparison
  */
export function findMatchingFusionTemplate(fusedSystem: any, molecule: Molecule): FusionTemplate | null {
  // For now, use simple heuristics based on ring count and heteroatoms
  const rings: number[][] = fusedSystem.rings || [];
  const ringCount = rings.length;
  const allRingAtoms = new Set<number>();
  for (const ring of rings) {
    for (const atomIdx of ring) allRingAtoms.add(atomIdx);
  }
  const heteroAtoms = Array.from(allRingAtoms).filter(idx => {
    const atom = molecule.atoms[idx];
    return atom && atom.symbol !== 'C';
  });

  // Simple matching logic
  if (ringCount === 2 && heteroAtoms.length === 0) {
    // Could be naphthalene or azulene
    const ringSizes = rings.map((r: number[]) => r.length).sort();
    if (ringSizes.every((s: number) => s === 6)) return FUSION_TEMPLATES.find(t => t.name === 'naphthaleno') || null;
  }

  if (ringCount === 3 && heteroAtoms.length === 0) {
    // Could be anthracene or phenanthrene
    return FUSION_TEMPLATES.find(t => t.name === 'anthraceno') || null;
  }

  if (ringCount === 2 && heteroAtoms.some(a => molecule.atoms[a]?.symbol === 'N')) {
    const nCount = heteroAtoms.filter(a => molecule.atoms[a]?.symbol === 'N').length;
    if (nCount === 1) {
      const ringSizes = rings.map((r: number[]) => r.length).sort();
      if (ringSizes.includes(5) && (ringSizes.includes(6) || ringSizes.includes(7))) {
        return FUSION_TEMPLATES.find(t => t.name === 'indole') || null;
      }
    }
  }

  // Add more matching logic as needed
  return null;
}

/**
 * Parse a fusion template into a molecule with locant mapping
 */
export function parseFusionTemplate(template: FusionTemplate): ParsedFusionTemplate | null {
  try {
    const result = parseSMILES(template.smiles);
    if (!result.molecules[0]) return null;

    const molecule = result.molecules[0];
    const locantMap = new Map<number, string>();

    // Map labels to atom indices (assuming labels correspond to SMILES atom order)
    // This is a simplification - in practice, need to handle ring closures etc.
    for (let i = 0; i < Math.min(template.labels.length, molecule.atoms.length); i++) {
      const label = template.labels[i];
      if (label) {
        locantMap.set(i, label);
      }
    }

    return {
      template,
      molecule,
      locantMap
    };
  } catch (e) {
    return null;
  }
}