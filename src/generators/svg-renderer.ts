import type { Molecule } from 'types';
import { generateCoordinates } from 'src/utils/coordinate-generator';
import { StereoType as StereoEnum, BondType } from 'types';
import { kekulize } from 'src/utils/kekulize';
import type { SVGRendererOptions, SVGRenderResult, AtomCoordinates } from './svg-renderer/types';
import { DEFAULT_COLORS } from './svg-renderer/types';
import { svgLine, svgWedgeBond, svgDashedBond, svgText } from './svg-renderer/svg-primitives';
import { normalizeCoordinates, createCoordinateTransforms, regularizeRingCoordinates } from './svg-renderer/coordinate-utils';
import { detectAromaticRings } from './svg-renderer/aromatic-ring-detector';
import { assignStereoBondsFromChirality } from './svg-renderer/stereo-bonds';
import { svgDoubleBond, svgTripleBond } from './svg-renderer/double-bond-renderer';
import { determineVisibleAtoms } from './svg-renderer/atom-visibility';

export type { SVGRendererOptions, SVGRenderResult };

export function renderSVG(
  input: string | Molecule,
  options: SVGRendererOptions = {}
): SVGRenderResult {
  let molecule: Molecule | null = null;
  if (typeof input === 'string') {
    return { svg: '', width: 0, height: 0, errors: ['SMILES parsing not implemented in stub'] };
  } else {
    molecule = input;
  }
  if (!molecule) return { svg: '', width: 0, height: 0, errors: ['No molecule provided'] };

  molecule = assignStereoBondsFromChirality(molecule);
  
  const shouldKekulize = options.kekulize !== false;
  if (shouldKekulize) {
    molecule = kekulize(molecule);
  }

  const rawCoords = options.atomCoordinates ?? generateCoordinates(molecule, options);
  const coords: AtomCoordinates[] = normalizeCoordinates(rawCoords);
  
  const atomIdToIndex = new Map<number, number>();
  molecule.atoms.forEach((a, idx) => atomIdToIndex.set(a.id, idx));
  if (molecule.ringInfo) {
    for (let rid = 0; rid < molecule.ringInfo.rings.length; ++rid) {
      const ring = molecule.ringInfo.rings[rid];
      if (!ring) continue;
      regularizeRingCoordinates(coords, Array.from(ring), atomIdToIndex);
    }
  }
  
  const atomIdToCoords = new Map<number, AtomCoordinates>();
  molecule.atoms.forEach((atom, index) => {
    atomIdToCoords.set(atom.id, coords[index]!);
  });
  
  const width = options.width ?? 250;
  const height = options.height ?? 200;
  const padding = options.padding ?? 20;
  const bondColor = options.bondColor ?? '#000000';
  const bondLineWidth = options.bondLineWidth ?? 2;
  const fontSize = options.fontSize ?? 16;
  const fontFamily = options.fontFamily ?? 'sans-serif';
  const atomColors = { ...DEFAULT_COLORS, ...(options.atomColors ?? {}) };
  const showStereoBonds = options.showStereoBonds ?? true;

  const [tx, ty] = createCoordinateTransforms(coords, width, height, padding, !!options.atomCoordinates);

let svg = `<?xml version='1.0' encoding='iso-8859-1'?>
<svg version='1.1' baseProfile='full'
              xmlns='http://www.w3.org/2000/svg'
                      xmlns:rdkit='http://www.rdkit.org/xml'
                      xmlns:xlink='http://www.w3.org/1999/xlink'
                  xml:space='preserve'
width='${width}px' height='${height}px' viewBox='0 0 ${width} ${height}'>
<!-- END OF HEADER -->
`;
svg += `<rect style='opacity:1.0;fill:#FFFFFF;stroke:none' width='${width}.0' height='${height}.0' x='0.0' y='0.0'> </rect>
`;

  const atomsToShow = determineVisibleAtoms(molecule, options.showCarbonLabels ?? false);

  const aromaticRings = detectAromaticRings(molecule);

  const bondsInAromaticRings = new Set<number>();
  for (const aromRing of aromaticRings) {
    for (const bond of aromRing.bonds) {
      const bondIdx = molecule.bonds.indexOf(bond);
      bondsInAromaticRings.add(bondIdx);
    }
  }

  for (let bondIndex = 0; bondIndex < molecule.bonds.length; bondIndex++) {
    if (bondsInAromaticRings.has(bondIndex)) {
      const bond = molecule.bonds[bondIndex]!;
      const a1 = coords[bond.atom1];
      const a2 = coords[bond.atom2];
      if (!a1 || !a2) continue;
      
      const x1 = tx(a1.x);
      const y1 = ty(a1.y);
      const x2 = tx(a2.x);
      const y2 = ty(a2.y);
      
      const bondClass = `bond-${bondIndex} atom-${bond.atom1} atom-${bond.atom2}`;
      
      if (bond.type === BondType.SINGLE) {
        svg += svgLine(x1, y1, x2, y2, bondColor, bondLineWidth, bondClass);
      } else if (bond.type === BondType.DOUBLE || bond.type === BondType.AROMATIC) {
        const aromRing = aromaticRings.find(r => r.bonds.includes(bond));
        if (aromRing) {
          const ringCoords = aromRing.atoms.map(atomId => {
            const idx = molecule.atoms.findIndex(a => a.id === atomId);
            return coords[idx];
          }).filter(c => c !== undefined);
          
          let cx = 0, cy = 0;
          for (const coord of ringCoords) {
            cx += coord.x;
            cy += coord.y;
          }
          cx /= ringCoords.length;
          cy /= ringCoords.length;
          
          const cxSvg = tx(cx);
          const cySvg = ty(cy);
          
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          let vx = cxSvg - mx;
          let vy = cySvg - my;
          const vlen = Math.sqrt(vx * vx + vy * vy);
          if (vlen > 0) { vx /= vlen; vy /= vlen; }
          
          const offset = bondLineWidth * 3.0;
          const innerOffset = offset * 0.9;
          
          let line2X1 = x1 + vx * innerOffset;
          let line2Y1 = y1 + vy * innerOffset;
          let line2X2 = x2 + vx * innerOffset;
          let line2Y2 = y2 + vy * innerOffset;
          
          const innerDx = line2X2 - line2X1;
          const innerDy = line2Y2 - line2Y1;
          const innerLen = Math.sqrt(innerDx * innerDx + innerDy * innerDy);
          const shortenAmount = innerLen * 0.11;
          line2X1 += innerDx / innerLen * shortenAmount;
          line2Y1 += innerDy / innerLen * shortenAmount;
          line2X2 -= innerDx / innerLen * shortenAmount;
          line2Y2 -= innerDy / innerLen * shortenAmount;
          
          svg += svgLine(x1, y1, x2, y2, bondColor, bondLineWidth, bondClass);
          svg += svgLine(line2X1, line2Y1, line2X2, line2Y2, bondColor, bondLineWidth, bondClass);
        }
      }
      svg += '\n';
      continue;
    }
    
    const bond = molecule.bonds[bondIndex]!;
    const a1 = coords[bond.atom1];
    const a2 = coords[bond.atom2];
    if (!a1 || !a2) continue;
    
    let x1 = tx(a1.x);
    let y1 = ty(a1.y);
    let x2 = tx(a2.x);
    let y2 = ty(a2.y);
    
    const shortenDistance = fontSize * 0.6;
    
    if (atomsToShow.has(bond.atom1)) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        x1 += (dx / len) * shortenDistance;
        y1 += (dy / len) * shortenDistance;
      }
    }
    
    if (atomsToShow.has(bond.atom2)) {
      const dx = x1 - x2;
      const dy = y1 - y2;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        x2 += (dx / len) * shortenDistance;
        y2 += (dy / len) * shortenDistance;
      }
    }
    
    const bondClass = `bond-${bondIndex} atom-${bond.atom1} atom-${bond.atom2}`;
    
    if (showStereoBonds && bond.stereo === StereoEnum.UP) {
      svg += svgWedgeBond(x1, y1, x2, y2, bondColor, bondLineWidth);
    } else if (showStereoBonds && bond.stereo === StereoEnum.DOWN) {
      svg += svgDashedBond(x1, y1, x2, y2, bondColor, bondLineWidth);
    } else if (bond.type === BondType.DOUBLE) {
      svg += svgDoubleBond(x1, y1, x2, y2, bondColor, bondLineWidth, bond, molecule, atomIdToCoords, bondClass);
    } else if (bond.type === BondType.TRIPLE) {
      svg += svgTripleBond(x1, y1, x2, y2, bondColor, bondLineWidth, bondClass);
    } else {
      svg += svgLine(x1, y1, x2, y2, bondColor, bondLineWidth, bondClass);
    }
    svg += '\n';
  }

  for (let i = 0; i < molecule.atoms.length; ++i) {
    const atom = molecule.atoms[i];
    const coord = coords[i];
    if (!atom || !coord) continue;
    const color = atomColors[atom.symbol] ?? atomColors.default ?? '#222';

    if (atomsToShow.has(i)) {
      const x = tx(coord.x);
      const y = ty(coord.y);
      
      let label = atom.symbol;
      
      if (options.showImplicitHydrogens && atom.hydrogens > 0 && atom.symbol !== 'C') {
        const hColor = atomColors['H'] ?? '#AAAAAA';
        const hText = atom.hydrogens === 1 ? 'H' : `H${atom.hydrogens}`;
        
        const atomWidth = label.length * fontSize * 0.6;
        const hWidth = hText.length * fontSize * 0.6;
        
        svg += svgText(x - hWidth / 2, y, label, color, fontSize, fontFamily);
        svg += svgText(x + atomWidth / 2, y, hText, hColor, fontSize, fontFamily);
      } else {
        svg += svgText(x, y, label, color, fontSize, fontFamily);
      }
    }
  }

svg += '</svg>\n';
return { svg, width, height, errors: [] };
}
