import type { Molecule, Atom, Bond } from 'types';
import { BondType, StereoType } from 'types';

export interface MolGeneratorOptions {
  title?: string;           // Molecule title (default: empty)
  programName?: string;     // Program name (default: "chemkit")
  dimensionality?: '2D' | '3D'; // Default: '2D'
  comment?: string;         // Comment line (default: empty)
}

interface Coordinates {
  x: number;
  y: number;
  z: number;
}

/**
 * Generate a MOL file (V2000 format) from a chemkit Molecule.
 * Matches RDKit output structure for compatibility.
 */
export function generateMolfile(molecule: Molecule, options?: MolGeneratorOptions): string {
  const opts = {
    title: '',
    programName: 'chemkit',
    dimensionality: '2D' as const,
    comment: '',
    ...options,
  };

  // Handle empty molecules
  if (molecule.atoms.length === 0) {
    return generateEmptyMolfile(opts);
  }

  // Generate 2D coordinates (chemkit molecules don't have coordinates)
  const coordinates = generate2DCoordinates(molecule);

  // Create atom index mapping (chemkit uses arbitrary IDs, MOL uses 1-based indices)
  const atomIndexMap = new Map<number, number>();
  molecule.atoms.forEach((atom, index) => {
    atomIndexMap.set(atom.id, index + 1); // 1-based indexing
  });

  // Generate MOL file sections
  const header = formatHeader(opts);
  const counts = formatCountsLine(molecule);
  const atomBlock = formatAtomBlock(molecule.atoms, coordinates);
  const bondBlock = formatBondBlock(molecule.bonds, atomIndexMap);
  const propertiesBlock = formatPropertiesBlock(molecule.atoms, atomIndexMap);

  // Combine all sections
  // Build string directly, line by line, to avoid leading newline from empty title
  let result = '';
  result += (header[0] ?? '') + '\n';
  result += (header[1] ?? '') + '\n';
  result += (header[2] ?? '') + '\n';
  result += counts + '\n';
  if (atomBlock.length > 0) result += atomBlock.join('\n') + '\n';
  if (bondBlock.length > 0) result += bondBlock.join('\n') + '\n';
  if (propertiesBlock.length > 0) result += propertiesBlock.join('\n') + '\n';
  result += 'M  END\n';
  return result;
}

function generateEmptyMolfile(options: MolGeneratorOptions): string {
  const header = formatHeader(options);
  let result = '';
  result += (header[0] ?? '') + '\n';
  result += (header[1] ?? '') + '\n';
  result += (header[2] ?? '') + '\n';
  result += '  0  0  0  0  0  0  0  0  0  0999 V2000\n';
  result += 'M  END\n';
  return result;
}

/**
 * Generate 2D coordinates for atoms using a simple circular layout.
 * Places atoms in a circle with fixed bond length.
 */
function generate2DCoordinates(molecule: Molecule): Map<number, Coordinates> {
  const coordinates = new Map<number, Coordinates>();
  const bondLength = 1.5; // Ångstroms

  if (molecule.atoms.length === 0) return coordinates;

  // Find connected components
  const components = findConnectedComponents(molecule);

  let componentOffset = 0;
  for (const component of components) {
    if (component.length === 1) {
      // Single atom - place at origin
      const atomId = component[0]!;
      coordinates.set(atomId, { x: componentOffset, y: 0, z: 0 });
      componentOffset += 3; // Space components apart
      continue;
    }

    // Place atoms in a circle
    const centerX = componentOffset;
    const centerY = 0;
    const radius = bondLength * component.length / (2 * Math.PI); // Adjust radius based on atom count

    component.forEach((atomId, index) => {
      const angle = (2 * Math.PI * index) / component.length;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      coordinates.set(atomId, { x, y, z: 0 });
    });

    componentOffset += radius * 2 + 2; // Space components apart
  }

  return coordinates;
}

/**
 * Find connected components in the molecule graph.
 */
function findConnectedComponents(molecule: Molecule): number[][] {
  const visited = new Set<number>();
  const components: number[][] = [];

  for (const atom of molecule.atoms) {
    if (visited.has(atom.id)) continue;

    const component: number[] = [];
    const queue = [atom.id];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;

      visited.add(current);
      component.push(current);

      // Find neighbors
      for (const bond of molecule.bonds) {
        if (bond.atom1 === current && !visited.has(bond.atom2)) {
          queue.push(bond.atom2);
        } else if (bond.atom2 === current && !visited.has(bond.atom1)) {
          queue.push(bond.atom1);
        }
      }
    }

    components.push(component);
  }

  return components;
}

/**
 * Format the MOL file header (3 lines).
 */
function formatHeader(options: MolGeneratorOptions): string[] {
  const programName = options.programName || 'chemkit';
  const dimensionality = options.dimensionality || '2D';
  const programLine = `     ${programName}${' '.repeat(Math.max(0, 10 - programName.length))}          ${dimensionality}`;

  return [
    options.title || '',
    programLine,
    options.comment || '',
  ];
}

/**
 * Format the counts line: aaabbblllfffcccsssxxxrrrpppiiimmmvvvvvv
 */
function formatCountsLine(molecule: Molecule): string {
  const numAtoms = molecule.atoms.length;
  const numBonds = molecule.bonds.length;
  const chiralFlag = molecule.atoms.some(atom => atom.chiral) ? 1 : 0;

  // Format: 3d 3d 3d 3d 3d 3d 3d 3d 3d 3d V2000
  // Each field is 3 characters, right-aligned
  return `${numAtoms.toString().padStart(3)}${numBonds.toString().padStart(3)}  0  0${chiralFlag}  0  0  0  0 0999 V2000`;
}

/**
 * Format the atom block (one line per atom).
 */
function formatAtomBlock(atoms: Atom[], coordinates: Map<number, Coordinates>): string[] {
  return atoms.map(atom => {
    const coord = coordinates.get(atom.id)!;
    const symbol = atom.symbol.padEnd(3);
    const massDiff = 0; // Use properties block for isotopes
    const charge = 0; // Use properties block for charges
    const stereoParity = getStereoParity(atom.chiral);

    // Format: %10.4f%10.4f%10.4f %-3s%2d%3d%3d%3d%3d%3d%3d%3d%3d%3d%3d%3d
    return `${coord.x.toFixed(4).padStart(10)}${coord.y.toFixed(4).padStart(10)}${coord.z.toFixed(4).padStart(10)} ${symbol}${massDiff.toString().padStart(2)}${charge.toString().padStart(3)}${stereoParity.toString().padStart(3)}  0  0  0  0  0  0`;
  });
}

/**
 * Convert chiral marker to stereo parity value.
 */
function getStereoParity(chiral: string | null): number {
  if (!chiral) return 0;
  if (chiral === '@') return 1; // counterclockwise
  if (chiral === '@@') return 2; // clockwise
  return 0; // other chiral markers not supported in V2000
}

/**
 * Format the bond block (one line per bond).
 */
function formatBondBlock(bonds: Bond[], atomIndexMap: Map<number, number>): string[] {
  return bonds.map(bond => {
    const atom1Idx = atomIndexMap.get(bond.atom1)!;
    const atom2Idx = atomIndexMap.get(bond.atom2)!;
    const bondType = getMolBondType(bond.type);
    const stereo = getMolBondStereo(bond.stereo);

    // Format: %3d%3d%3d%3d
    return `${atom1Idx.toString().padStart(3)}${atom2Idx.toString().padStart(3)}${bondType.toString().padStart(3)}${stereo.toString().padStart(3)}`;
  });
}

/**
 * Convert chemkit BondType to MOL bond type number.
 */
function getMolBondType(bondType: BondType): number {
  switch (bondType) {
    case BondType.SINGLE: return 1;
    case BondType.DOUBLE: return 2;
    case BondType.TRIPLE: return 3;
    case BondType.AROMATIC: return 4;
    default: return 1;
  }
}

/**
 * Convert chemkit StereoType to MOL bond stereo number.
 */
function getMolBondStereo(stereo: StereoType): number {
  switch (stereo) {
    case StereoType.NONE: return 0;
    case StereoType.UP: return 1;
    case StereoType.DOWN: return 6;
    case StereoType.EITHER: return 4;
    default: return 0;
  }
}

/**
 * Format the properties block (charges, isotopes, etc.).
 */
function formatPropertiesBlock(atoms: Atom[], atomIndexMap: Map<number, number>): string[] {
  const lines: string[] = [];

  // Handle charges
  const chargedAtoms = atoms.filter(atom => atom.charge !== 0 && atom.charge !== undefined);
  if (chargedAtoms.length > 0) {
    const chargeEntries: string[] = [];
    for (const atom of chargedAtoms) {
      const idx = atomIndexMap.get(atom.id)!;
      chargeEntries.push(`${idx.toString().padStart(3)} ${atom.charge!.toString().padStart(3)}`);
    }

    // Group in chunks of 8 (MOL format limit)
    for (let i = 0; i < chargeEntries.length; i += 8) {
      const chunk = chargeEntries.slice(i, i + 8);
      lines.push(`M  CHG  ${chunk.length} ${chunk.join(' ')}`);
    }
  }

  // Handle isotopes
  const isotopeAtoms = atoms.filter(atom => atom.isotope !== null && atom.isotope !== undefined);
  if (isotopeAtoms.length > 0) {
    const isotopeEntries: string[] = [];
    for (const atom of isotopeAtoms) {
      const idx = atomIndexMap.get(atom.id)!;
      isotopeEntries.push(`${idx.toString().padStart(3)} ${atom.isotope!.toString().padStart(3)}`);
    }

    // Group in chunks of 8
    for (let i = 0; i < isotopeEntries.length; i += 8) {
      const chunk = isotopeEntries.slice(i, i + 8);
      lines.push(`M  ISO  ${chunk.length} ${chunk.join(' ')}`);
    }
  }

  return lines;
}