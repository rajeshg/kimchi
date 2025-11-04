import type { Molecule, ParseResult } from "types";
import { generateCoordinates } from "src/utils/coordinate-generator";
import { StereoType as StereoEnum, BondType } from "types";
import { kekulize } from "src/utils/kekulize";
import type {
  SVGRendererOptions,
  SVGRenderResult,
  AtomCoordinates,
} from "./svg-renderer/types";
import { DEFAULT_COLORS } from "./svg-renderer/types";
import {
  svgLine,
  svgWedgeBond,
  svgDashedBond,
  svgText,
} from "./svg-renderer/svg-primitives";
import {
  normalizeCoordinates,
  createCoordinateTransforms,
  regularizeRingCoordinates,
  regularizeFusedRingClusters,
  snapBondAngles,
  computeLabelOffsets,
  computeLayoutQuality,
} from "./svg-renderer/coordinate-utils";
import { detectAromaticRings } from "./svg-renderer/aromatic-ring-detector";
import { assignStereoBondsFromChirality } from "./svg-renderer/stereo-bonds";
import {
  svgDoubleBond,
  svgTripleBond,
} from "./svg-renderer/double-bond-renderer";
import { determineVisibleAtoms } from "./svg-renderer/atom-visibility";

export type { SVGRendererOptions, SVGRenderResult };

interface MoleculeWithCoords {
  molecule: Molecule;
  coords: AtomCoordinates[];
  offsetX: number;
  offsetY: number;
}

export function renderSVG(
  input: string | Molecule | Molecule[] | ParseResult,
  options: SVGRendererOptions = {},
): SVGRenderResult {
  let molecules: Molecule[] = [];

  if (typeof input === "string") {
    return {
      svg: "",
      width: 0,
      height: 0,
      errors: ["SMILES parsing not implemented in stub"],
    };
  } else if (Array.isArray(input)) {
    molecules = input;
  } else if ("molecules" in input && Array.isArray(input.molecules)) {
    molecules = input.molecules;
  } else {
    molecules = [input as Molecule];
  }

  if (molecules.length === 0)
    return { svg: "", width: 0, height: 0, errors: ["No molecules provided"] };

  if (molecules.length === 1) {
    return renderSingleMolecule(molecules[0]!, options);
  }

  return renderMultipleMolecules(molecules, options);
}

function renderSingleMolecule(
  molecule: Molecule,
  options: SVGRendererOptions = {},
): SVGRenderResult {
  let mol = molecule;

  molecule = assignStereoBondsFromChirality(molecule);

  const shouldKekulize = options.kekulize !== false;
  if (shouldKekulize) {
    molecule = kekulize(molecule);
  }

  const rawCoords =
    options.atomCoordinates ?? generateCoordinates(molecule, options);
  const coords: AtomCoordinates[] = normalizeCoordinates(rawCoords);

  const atomIdToIndex = new Map<number, number>();
  molecule.atoms.forEach((a, idx) => atomIdToIndex.set(a.id, idx));

  let fusedRingIds: Set<number> | undefined;
  if (molecule.ringInfo) {
    const rings = molecule.ringInfo.rings;
    const ringAtoms = rings.map((r) => Array.from(r ?? []));
    const atomRingCount = new Map<number, number>();
    for (const atoms of ringAtoms) {
      for (const aid of atoms) {
        atomRingCount.set(aid, (atomRingCount.get(aid) ?? 0) + 1);
      }
    }

    fusedRingIds = new Set<number>();
    const adjacency = new Map<number, Set<number>>();
    const ringAtomSets = ringAtoms.map((atoms) => new Set(atoms));

    for (let rid = 0; rid < ringAtoms.length; rid++) {
      const atoms = ringAtoms[rid];
      if (!atoms || atoms.length === 0) continue;
      const isFused = atoms.some((aid) => (atomRingCount.get(aid) ?? 0) > 1);
      if (isFused) {
        fusedRingIds.add(rid);
      } else if (atoms.length === 5 || atoms.length === 6) {
        regularizeRingCoordinates(coords, atoms, atomIdToIndex);
      }
    }

    for (let i = 0; i < ringAtoms.length; i++) {
      if (!fusedRingIds.has(i)) continue;
      for (let j = i + 1; j < ringAtoms.length; j++) {
        if (!fusedRingIds.has(j)) continue;
        const setA = ringAtomSets[i];
        const setB = ringAtomSets[j];
        if (!setA || !setB) continue;
        const smaller = setA.size <= setB.size ? setA : setB;
        const larger = smaller === setA ? setB : setA;
        let shared = 0;
        for (const aid of smaller) {
          if (larger.has(aid)) {
            shared++;
            if (shared >= 2) break;
          }
        }
        if (shared >= 2) {
          if (!adjacency.has(i)) adjacency.set(i, new Set<number>());
          if (!adjacency.has(j)) adjacency.set(j, new Set<number>());
          adjacency.get(i)!.add(j);
          adjacency.get(j)!.add(i);
        }
      }
    }

    const fusedRingClusters: number[][] = [];
    const visited = new Set<number>();
    for (const rid of fusedRingIds) {
      if (visited.has(rid)) continue;
      const cluster: number[] = [];
      const queue: number[] = [rid];
      visited.add(rid);
      while (queue.length > 0) {
        const current = queue.shift()!;
        cluster.push(current);
        const neighbors = adjacency.get(current);
        if (!neighbors) continue;
        for (const next of neighbors) {
          if (visited.has(next)) continue;
          visited.add(next);
          queue.push(next);
        }
      }
      if (cluster.length > 0) {
        fusedRingClusters.push(cluster);
      }
    }

    if (fusedRingClusters.length > 0) {
      regularizeFusedRingClusters(
        coords,
        fusedRingClusters,
        rings,
        atomIdToIndex,
      );
    }
  }

  // Apply constrained multi-pass snapping while respecting fused ring layouts.
  try {
    snapBondAngles(coords, molecule, undefined, 3, fusedRingIds);
  } catch (e) {
    // defensive: if snapping fails, continue with original coords
  }

  const atomIdToCoords = new Map<number, AtomCoordinates>();
  molecule.atoms.forEach((atom, index) => {
    atomIdToCoords.set(atom.id, coords[index]!);
  });

  const width = options.width ?? 250;
  const height = options.height ?? 200;
  const padding = options.padding ?? 20;
  const bondColor = options.bondColor ?? "#000000";
  const bondLineWidth = options.bondLineWidth ?? 2;
  const fontSize = options.fontSize ?? 16;
  const fontFamily = options.fontFamily ?? "sans-serif";
  const atomColors = { ...DEFAULT_COLORS, ...(options.atomColors ?? {}) };
  const showStereoBonds = options.showStereoBonds ?? true;

  const [tx, ty] = createCoordinateTransforms(
    coords,
    width,
    height,
    padding,
    !!options.atomCoordinates,
  );

  // Compute bounding box in SVG coordinate space (after transforms) so we can emit
  // a tight, normalized viewBox and keep preserveAspectRatio for consistent scaling.
  const transformedPoints = coords
    .filter(Boolean)
    .map((c) => ({ x: tx(c.x), y: ty(c.y) }));

  // Prepare SVG-space coords array for helpers (one entry per atom index)
  const svgCoords: Array<{ x: number; y: number } | undefined> = new Array(
    coords.length,
  );
  for (let i = 0; i < coords.length; i++) {
    const c = coords[i];
    if (!c) {
      svgCoords[i] = undefined;
      continue;
    }
    svgCoords[i] = { x: tx(c.x), y: ty(c.y) };
  }

  // Decide which atoms get labels
  // (we compute label offsets and layout quality after this point)

  const atomsToShow = determineVisibleAtoms(
    molecule,
    options.showCarbonLabels ?? false,
  );

  // Prepare a dense SVG coordinate array (no undefined) for helper routines
  const denseSvgCoords: Array<{ x: number; y: number }> = svgCoords.map(
    (c) => c ?? { x: 0, y: 0 },
  );

  // Compute label offsets to avoid overlaps in SVG space
  let labelOffsets = new Map<number, { dx: number; dy: number }>();
  try {
    labelOffsets = computeLabelOffsets(
      denseSvgCoords,
      molecule,
      atomsToShow,
      fontSize,
      bondLineWidth,
    );
  } catch (e) {
    labelOffsets = new Map();
  }

  // For heteroatoms that are part of rings (e.g. the N in pyridine), prefer
  // drawing the label centered on the atom so it overlaps ring lines like RDKit.
  // Build a set of atom indices that are heteroatoms in any ring and force
  // their label offsets to zero.
  const heteroRingIndices = new Set<number>();
  try {
    if (molecule.ringInfo && Array.isArray(molecule.ringInfo.rings)) {
      for (const ring of molecule.ringInfo.rings) {
        if (!ring) continue;
        for (const aid of ring) {
          const idx = atomIdToIndex.get(aid as number);
          if (idx !== undefined) {
            const atom = molecule.atoms[idx];
            if (atom && atom.symbol !== "C") {
              heteroRingIndices.add(idx);
            }
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }

  // Override offsets for heteroatoms in rings so the label sits centered
  // on the atom coordinate (dx=0, dy=0).
  for (const idx of heteroRingIndices) {
    labelOffsets.set(idx, { dx: 0, dy: 0 });
  }

  let vbX = 0,
    vbY = 0,
    vbW = width,
    vbH = height;
  if (transformedPoints.length > 0) {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;

    for (let i = 0; i < molecule.atoms.length; i++) {
      const coord = svgCoords[i];
      if (!coord) continue;

      let atomMinX = coord.x;
      let atomMaxX = coord.x;
      let atomMinY = coord.y;
      let atomMaxY = coord.y;

      if (atomsToShow.has(i)) {
        const atom = molecule.atoms[i]!;
        let label = atom.symbol;
        if (
          options.showImplicitHydrogens &&
          atom.hydrogens > 0 &&
          atom.symbol !== "C"
        ) {
          const hText = atom.hydrogens === 1 ? "H" : `H${atom.hydrogens}`;
          label = atom.symbol + hText;
        }

        const offsets = labelOffsets.get(i) ?? { dx: 0, dy: 0 };
        const labelX = coord.x + offsets.dx;
        const labelY = coord.y + offsets.dy;

        const labelWidth = label.length * fontSize * 0.6;
        const labelHeight = fontSize * 1.2;

        atomMinX = Math.min(atomMinX, labelX - labelWidth / 2);
        atomMaxX = Math.max(atomMaxX, labelX + labelWidth / 2);
        atomMinY = Math.min(atomMinY, labelY - labelHeight / 2);
        atomMaxY = Math.max(atomMaxY, labelY + labelHeight / 2);

        if (atom.charge !== 0) {
          const chargeSign = atom.charge > 0 ? "+" : "−";
          const chargeStr =
            Math.abs(atom.charge) > 1
              ? `${Math.abs(atom.charge)}${chargeSign}`
              : chargeSign;
          const chargeX = labelX + fontSize * 0.5;
          const chargeY = labelY - fontSize * 0.3;
          const smallFontSize = fontSize * 0.7;

          const chargeWidth = chargeStr.length * smallFontSize * 0.6;
          const chargeHeight = smallFontSize * 1.2;
          atomMinX = Math.min(atomMinX, chargeX - chargeWidth / 2);
          atomMaxX = Math.max(atomMaxX, chargeX + chargeWidth / 2);
          atomMinY = Math.min(atomMinY, chargeY - chargeHeight / 2);
          atomMaxY = Math.max(atomMaxY, chargeY + chargeHeight / 2);
        }
      }

      minX = Math.min(minX, atomMinX);
      maxX = Math.max(maxX, atomMaxX);
      minY = Math.min(minY, atomMinY);
      maxY = Math.max(maxY, atomMaxY);
    }

    if (isFinite(minX) && isFinite(maxX) && isFinite(minY) && isFinite(maxY)) {
      const bbPadding = Math.max(8, Math.min(padding, 40));
      vbX = minX - bbPadding;
      vbY = minY - bbPadding;
      vbW = maxX - minX + bbPadding * 2;
      vbH = maxY - minY + bbPadding * 2;
    } else {
      const xs = transformedPoints.map((p) => p.x);
      const ys = transformedPoints.map((p) => p.y);
      const minXFallback = Math.min(...xs);
      const maxXFallback = Math.max(...xs);
      const minYFallback = Math.min(...ys);
      const maxYFallback = Math.max(...ys);

      const bbPadding = Math.max(8, Math.min(padding, 40));
      vbX = minXFallback - bbPadding;
      vbY = minYFallback - bbPadding;
      vbW = maxXFallback - minXFallback + bbPadding * 2;
      vbH = maxYFallback - minYFallback + bbPadding * 2;
    }

    vbW = Math.max(vbW, 16);
    vbH = Math.max(vbH, 16);
  }

  let svg =
    `<?xml version='1.0' encoding='iso-8859-1'?>\n` +
    `<svg version='1.1' baseProfile='full' xmlns='http://www.w3.org/2000/svg' xmlns:rdkit='http://www.rdkit.org/xml' xmlns:xlink='http://www.w3.org/1999/xlink' xml:space='preserve' preserveAspectRatio='xMidYMid meet' width='${width}px' height='${height}px' viewBox='${vbX} ${vbY} ${vbW} ${vbH}'>\n<!-- END OF HEADER -->\n`;

  let svgBody = ` <rect style='opacity:1.0;fill:#FFFFFF;stroke:none' width='${vbW}.0' height='${vbH}.0' x='${vbX}.0' y='${vbY}.0'> </rect>\n`;

  // Compute a layout quality score and append as comment to the SVG header
  try {
    const quality = computeLayoutQuality(
      coords,
      molecule,
      atomsToShow,
      fontSize,
      bondLineWidth,
    );
    const qc = `<!-- layout-quality: total=${quality.total.toFixed(3)} angle=${quality.components.angle.toFixed(3)} length=${quality.components.length.toFixed(3)} atomOverlap=${quality.components.atomOverlap.toFixed(3)} labelOverlap=${quality.components.labelOverlap.toFixed(3)} -->\n`;
    svg += qc;
  } catch (e) {
    // ignore
  }

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
      const idxA = atomIdToIndex.get(bond.atom1 as number) ?? -1;
      const idxB = atomIdToIndex.get(bond.atom2 as number) ?? -1;
      const a1 = idxA >= 0 ? coords[idxA] : undefined;
      const a2 = idxB >= 0 ? coords[idxB] : undefined;
      if (!a1 || !a2) continue;

      const x1 = tx(a1.x);
      const y1 = ty(a1.y);
      const x2 = tx(a2.x);
      const y2 = ty(a2.y);

      const bondClass = `bond-${bondIndex} atom-${bond.atom1} atom-${bond.atom2}`;

      if (bond.type === BondType.SINGLE) {
        svgBody += svgLine(x1, y1, x2, y2, bondColor, bondLineWidth, bondClass);
      } else if (
        bond.type === BondType.DOUBLE ||
        bond.type === BondType.AROMATIC
      ) {
        // For bonds that participate in aromatic rings, compute an orientation
        // using the average center of all aromatic rings that include this bond.
        // This makes the offset decision stable for fused rings (e.g., naphthalene)
        // where a bond may belong to more than one ring.
        const ringsForBond = aromaticRings.filter((r) =>
          r.bonds.includes(bond),
        );
        if (ringsForBond.length > 0) {
          let cx = 0,
            cy = 0,
            count = 0;
          for (const ring of ringsForBond) {
            for (const atomId of ring.atoms) {
              const idx = molecule.atoms.findIndex((a) => a.id === atomId);
              const c = coords[idx];
              if (c) {
                cx += c.x;
                cy += c.y;
                count++;
              }
            }
          }
          if (count > 0) {
            cx /= count;
            cy /= count;

            const cxSvg = tx(cx);
            const cySvg = ty(cy);

            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            let vx = cxSvg - mx;
            let vy = cySvg - my;
            const vlen = Math.sqrt(vx * vx + vy * vy);
            if (vlen > 0) {
              vx /= vlen;
              vy /= vlen;
            }

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
            line2X1 += (innerDx / innerLen) * shortenAmount;
            line2Y1 += (innerDy / innerLen) * shortenAmount;
            line2X2 -= (innerDx / innerLen) * shortenAmount;
            line2Y2 -= (innerDy / innerLen) * shortenAmount;

            svgBody += svgLine(
              x1,
              y1,
              x2,
              y2,
              bondColor,
              bondLineWidth,
              bondClass,
            );
            svgBody += svgLine(
              line2X1,
              line2Y1,
              line2X2,
              line2Y2,
              bondColor,
              bondLineWidth,
              bondClass,
            );
          }
        }
      }
      svgBody += "\n";
      continue;
    }

    const bond = molecule.bonds[bondIndex]!;
    const idxA = atomIdToIndex.get(bond.atom1 as number) ?? -1;
    const idxB = atomIdToIndex.get(bond.atom2 as number) ?? -1;
    const a1 = idxA >= 0 ? coords[idxA] : undefined;
    const a2 = idxB >= 0 ? coords[idxB] : undefined;
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
        // If this atom is a heteroatom inside a ring we prefer the label to
        // overlap the bond (do not shorten). Otherwise shorten to avoid
        // overlapping label text.
        const atom1Idx = atomIdToIndex.get(bond.atom1 as number) ?? -1;
        if (!heteroRingIndices.has(atom1Idx)) {
          x1 += (dx / len) * shortenDistance;
          y1 += (dy / len) * shortenDistance;
        }
      }
    }

    if (atomsToShow.has(bond.atom2)) {
      const dx = x1 - x2;
      const dy = y1 - y2;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        const atom2Idx = atomIdToIndex.get(bond.atom2 as number) ?? -1;
        if (!heteroRingIndices.has(atom2Idx)) {
          x2 += (dx / len) * shortenDistance;
          y2 += (dy / len) * shortenDistance;
        }
      }
    }

    const bondClass = `bond-${bondIndex} atom-${bond.atom1} atom-${bond.atom2}`;

    if (showStereoBonds && bond.stereo === StereoEnum.UP) {
      svgBody += svgWedgeBond(x1, y1, x2, y2, bondColor, bondLineWidth);
    } else if (showStereoBonds && bond.stereo === StereoEnum.DOWN) {
      svgBody += svgDashedBond(x1, y1, x2, y2, bondColor, bondLineWidth);
    } else if (bond.type === BondType.DOUBLE) {
      svgBody += svgDoubleBond(
        x1,
        y1,
        x2,
        y2,
        bondColor,
        bondLineWidth,
        bond,
        molecule,
        atomIdToCoords,
        bondClass,
      );
    } else if (bond.type === BondType.TRIPLE) {
      svgBody += svgTripleBond(
        x1,
        y1,
        x2,
        y2,
        bondColor,
        bondLineWidth,
        bondClass,
      );
    } else {
      svgBody += svgLine(x1, y1, x2, y2, bondColor, bondLineWidth, bondClass);
    }
    svgBody += "\n";
  }

  for (let i = 0; i < molecule.atoms.length; ++i) {
    const atom = molecule.atoms[i];
    const coord = coords[i];
    if (!atom || !coord) continue;
    const color = atomColors[atom.symbol] ?? atomColors.default ?? "#222";

    if (atomsToShow.has(i)) {
      const x = tx(coord.x);
      const y = ty(coord.y);

      const offsets = labelOffsets.get(i) ?? { dx: 0, dy: 0 };
      const labelX = x + offsets.dx;
      const labelY = y + offsets.dy;

      let label = atom.symbol;

      if (
        options.showImplicitHydrogens &&
        atom.hydrogens > 0 &&
        atom.symbol !== "C"
      ) {
        const hColor = atomColors["H"] ?? "#AAAAAA";
        const hText = atom.hydrogens === 1 ? "H" : `H${atom.hydrogens}`;

        const atomWidth = label.length * fontSize * 0.6;
        const hWidth = hText.length * fontSize * 0.6;

        const isHeteroRing = heteroRingIndices.has(i);
        svgBody += svgText(
          labelX - hWidth / 2,
          labelY,
          label,
          color,
          fontSize,
          fontFamily,
          isHeteroRing ? { background: true } : undefined,
        );
        svgBody += svgText(
          labelX + atomWidth / 2,
          labelY,
          hText,
          hColor,
          fontSize,
          fontFamily,
          isHeteroRing ? { background: true } : undefined,
        );
      } else {
        const isHeteroRing = heteroRingIndices.has(i);
        svgBody += svgText(
          labelX,
          labelY,
          label,
          color,
          fontSize,
          fontFamily,
          isHeteroRing ? { background: true } : undefined,
        );
      }

      if (atom.charge !== 0) {
        const chargeSign = atom.charge > 0 ? "+" : "−";
        const chargeStr =
          Math.abs(atom.charge) > 1
            ? `${Math.abs(atom.charge)}${chargeSign}`
            : chargeSign;
        const chargeX = labelX + fontSize * 0.5;
        const chargeY = labelY - fontSize * 0.3;
        const smallFontSize = fontSize * 0.7;
        svgBody += svgText(
          chargeX,
          chargeY,
          chargeStr,
          color,
          smallFontSize,
          fontFamily,
        );
      }
    }
  }

  svg += svgBody;
  svg += "</svg>\n";
  return { svg, width, height, errors: [] };
}

function renderMultipleMolecules(
  molecules: Molecule[],
  options: SVGRendererOptions = {},
): SVGRenderResult {
  const moleculesWithCoords: MoleculeWithCoords[] = [];
  const spacing = options.moleculeSpacing ?? 60;

  for (const mol of molecules) {
    let processed = assignStereoBondsFromChirality(mol);
    const shouldKekulize = options.kekulize !== false;
    if (shouldKekulize) {
      processed = kekulize(processed);
    }

    const rawCoords =
      options.atomCoordinates ?? generateCoordinates(processed, options);
    const coords = normalizeCoordinates(rawCoords);

    moleculesWithCoords.push({
      molecule: processed,
      coords,
      offsetX: 0,
      offsetY: 0,
    });
  }

  const width = options.width ?? 250;
  const height = options.height ?? 200;
  const padding = options.padding ?? 20;

  const allBounds: Array<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  }> = [];

  for (const mwc of moleculesWithCoords) {
    const coords = mwc.coords;
    if (coords.length === 0) {
      allBounds.push({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
      continue;
    }

    const xs = coords.filter((c) => c).map((c) => c!.x);
    const ys = coords.filter((c) => c).map((c) => c!.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    allBounds.push({ minX, maxX, minY, maxY });
  }

  let currentX = 0;
  let maxY = 0;

  for (let i = 0; i < moleculesWithCoords.length; i++) {
    const bounds = allBounds[i]!;
    let width_i = bounds.maxX - bounds.minX;
    let height_i = bounds.maxY - bounds.minY;
    let isSingleAtom = false;

    if (
      width_i === 0 &&
      height_i === 0 &&
      moleculesWithCoords[i]!.molecule.atoms.length === 1
    ) {
      width_i = 30;
      height_i = 30;
      isSingleAtom = true;
    }

    moleculesWithCoords[i]!.offsetX =
      currentX - bounds.minX + (isSingleAtom ? width_i / 2 : 0);
    moleculesWithCoords[i]!.offsetY =
      -bounds.minY + (isSingleAtom ? height_i / 2 : 0);

    currentX += width_i + spacing;
    maxY = Math.max(maxY, height_i);
  }

  const totalWidth = currentX - spacing;
  const totalHeight = maxY;

  const bondColor = options.bondColor ?? "#000000";
  const bondLineWidth = options.bondLineWidth ?? 2;
  const fontSize = options.fontSize ?? 16;
  const fontFamily = options.fontFamily ?? "sans-serif";
  const atomColors = { ...DEFAULT_COLORS, ...(options.atomColors ?? {}) };
  const showStereoBonds = options.showStereoBonds ?? true;

  const vbPadding = Math.max(8, Math.min(padding, 40));
  const vbX = -vbPadding;
  const vbY = -vbPadding;
  const vbW = totalWidth + vbPadding * 2;
  const vbH = totalHeight + vbPadding * 2;

  let svg =
    `<?xml version='1.0' encoding='iso-8859-1'?>\n` +
    `<svg version='1.1' baseProfile='full' xmlns='http://www.w3.org/2000/svg' xmlns:rdkit='http://www.rdkit.org/xml' xmlns:xlink='http://www.w3.org/1999/xlink' xml:space='preserve' preserveAspectRatio='xMidYMid meet' width='${width}px' height='${height}px' viewBox='${vbX} ${vbY} ${vbW} ${vbH}'>\n<!-- END OF HEADER -->\n`;

  let svgBody = ` <rect style='opacity:1.0;fill:#FFFFFF;stroke:none' width='${vbW}' height='${vbH}' x='${vbX}' y='${vbY}'> </rect>\n`;

  for (const mwc of moleculesWithCoords) {
    const molecule = mwc.molecule;
    const coords = mwc.coords;
    const offsetX = mwc.offsetX;
    const offsetY = mwc.offsetY;

    const tx = (x: number) => x + offsetX;
    const ty = (y: number) => y + offsetY;

    const atomIdToIndex = new Map<number, number>();
    molecule.atoms.forEach((a, idx) => atomIdToIndex.set(a.id, idx));

    const atomIdToCoords = new Map<number, AtomCoordinates>();
    molecule.atoms.forEach((atom, index) => {
      const c = coords[index];
      if (c) {
        atomIdToCoords.set(atom.id, {
          x: tx(c.x),
          y: ty(c.y),
        });
      }
    });

    const atomsToShow = determineVisibleAtoms(
      molecule,
      options.showCarbonLabels ?? false,
    );
    const aromaticRings = detectAromaticRings(molecule);

    // Compute heteroatoms that belong to rings for this molecule and force
    // their labels to be centered (so they overlap ring lines) and avoid
    // bond shortening around them.
    const heteroRingIndices = new Set<number>();
    try {
      if (molecule.ringInfo && Array.isArray(molecule.ringInfo.rings)) {
        for (const ring of molecule.ringInfo.rings) {
          if (!ring) continue;
          for (const aid of ring) {
            const idx = atomIdToIndex.get(aid as number);
            if (idx !== undefined) {
              const atom = molecule.atoms[idx];
              if (atom && atom.symbol !== "C") {
                heteroRingIndices.add(idx);
              }
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }

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
        const idxA = atomIdToIndex.get(bond.atom1 as number) ?? -1;
        const idxB = atomIdToIndex.get(bond.atom2 as number) ?? -1;
        const a1 = idxA >= 0 ? coords[idxA] : undefined;
        const a2 = idxB >= 0 ? coords[idxB] : undefined;
        if (!a1 || !a2) continue;

        const x1 = tx(a1.x);
        const y1 = ty(a1.y);
        const x2 = tx(a2.x);
        const y2 = ty(a2.y);

        const bondClass = `bond-${bondIndex} atom-${bond.atom1} atom-${bond.atom2}`;

        if (bond.type === BondType.SINGLE) {
          svgBody += svgLine(
            x1,
            y1,
            x2,
            y2,
            bondColor,
            bondLineWidth,
            bondClass,
          );
        } else if (
          bond.type === BondType.DOUBLE ||
          bond.type === BondType.AROMATIC
        ) {
          const ringsForBond = aromaticRings.filter((r) =>
            r.bonds.includes(bond),
          );
          if (ringsForBond.length > 0) {
            let cx = 0,
              cy = 0,
              count = 0;
            for (const ring of ringsForBond) {
              for (const atomId of ring.atoms) {
                const idx = molecule.atoms.findIndex((a) => a.id === atomId);
                const c = coords[idx];
                if (c) {
                  cx += c.x;
                  cy += c.y;
                  count++;
                }
              }
            }
            if (count > 0) {
              cx /= count;
              cy /= count;

              const cxSvg = tx(cx);
              const cySvg = ty(cy);

              const mx = (x1 + x2) / 2;
              const my = (y1 + y2) / 2;
              let vx = cxSvg - mx;
              let vy = cySvg - my;
              const vlen = Math.sqrt(vx * vx + vy * vy);
              if (vlen > 0) {
                vx /= vlen;
                vy /= vlen;
              }

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
              line2X1 += (innerDx / innerLen) * shortenAmount;
              line2Y1 += (innerDy / innerLen) * shortenAmount;
              line2X2 -= (innerDx / innerLen) * shortenAmount;
              line2Y2 -= (innerDy / innerLen) * shortenAmount;

              svgBody += svgLine(
                x1,
                y1,
                x2,
                y2,
                bondColor,
                bondLineWidth,
                bondClass,
              );
              svgBody += svgLine(
                line2X1,
                line2Y1,
                line2X2,
                line2Y2,
                bondColor,
                bondLineWidth,
                bondClass,
              );
            }
          }
        }
        svgBody += "\n";
        continue;
      }

      const bond = molecule.bonds[bondIndex]!;
      const idxA = atomIdToIndex.get(bond.atom1 as number) ?? -1;
      const idxB = atomIdToIndex.get(bond.atom2 as number) ?? -1;
      const a1 = idxA >= 0 ? coords[idxA] : undefined;
      const a2 = idxB >= 0 ? coords[idxB] : undefined;
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
          const atom1Idx = atomIdToIndex.get(bond.atom1 as number) ?? -1;
          if (!heteroRingIndices.has(atom1Idx)) {
            x1 += (dx / len) * shortenDistance;
            y1 += (dy / len) * shortenDistance;
          }
        }
      }

      if (atomsToShow.has(bond.atom2)) {
        const dx = x1 - x2;
        const dy = y1 - y2;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
          const atom2Idx = atomIdToIndex.get(bond.atom2 as number) ?? -1;
          if (!heteroRingIndices.has(atom2Idx)) {
            x2 += (dx / len) * shortenDistance;
            y2 += (dy / len) * shortenDistance;
          }
        }
      }

      const bondClass = `bond-${bondIndex} atom-${bond.atom1} atom-${bond.atom2}`;

      if (showStereoBonds && bond.stereo === StereoEnum.UP) {
        svgBody += svgWedgeBond(x1, y1, x2, y2, bondColor, bondLineWidth);
      } else if (showStereoBonds && bond.stereo === StereoEnum.DOWN) {
        svgBody += svgDashedBond(x1, y1, x2, y2, bondColor, bondLineWidth);
      } else if (bond.type === BondType.DOUBLE) {
        svgBody += svgDoubleBond(
          x1,
          y1,
          x2,
          y2,
          bondColor,
          bondLineWidth,
          bond,
          molecule,
          atomIdToCoords,
          bondClass,
        );
      } else if (bond.type === BondType.TRIPLE) {
        svgBody += svgTripleBond(
          x1,
          y1,
          x2,
          y2,
          bondColor,
          bondLineWidth,
          bondClass,
        );
      } else {
        svgBody += svgLine(x1, y1, x2, y2, bondColor, bondLineWidth, bondClass);
      }
      svgBody += "\n";
    }

    for (let i = 0; i < molecule.atoms.length; ++i) {
      const atom = molecule.atoms[i];
      const coord = coords[i];
      if (!atom || !coord) continue;
      const color = atomColors[atom.symbol] ?? atomColors.default ?? "#222";

      if (atomsToShow.has(i)) {
        const x = tx(coord.x);
        const y = ty(coord.y);

        let label = atom.symbol;

        if (
          options.showImplicitHydrogens &&
          atom.hydrogens > 0 &&
          atom.symbol !== "C"
        ) {
          const hColor = atomColors["H"] ?? "#AAAAAA";
          const hText = atom.hydrogens === 1 ? "H" : `H${atom.hydrogens}`;

          const atomWidth = label.length * fontSize * 0.6;
          const hWidth = hText.length * fontSize * 0.6;

          const atomIdx = i;
          const isHeteroRing = heteroRingIndices.has(atomIdx);
          svgBody += svgText(
            x - hWidth / 2,
            y,
            label,
            color,
            fontSize,
            fontFamily,
            isHeteroRing ? { background: true } : undefined,
          );
          svgBody += svgText(
            x + atomWidth / 2,
            y,
            hText,
            hColor,
            fontSize,
            fontFamily,
            isHeteroRing ? { background: true } : undefined,
          );
        } else {
          const atomIdx = i;
          const isHeteroRing = heteroRingIndices.has(atomIdx);
          svgBody += svgText(
            x,
            y,
            label,
            color,
            fontSize,
            fontFamily,
            isHeteroRing ? { background: true } : undefined,
          );
        }

        if (atom.charge !== 0) {
          const chargeSign = atom.charge > 0 ? "+" : "−";
          const chargeStr =
            Math.abs(atom.charge) > 1
              ? `${Math.abs(atom.charge)}${chargeSign}`
              : chargeSign;
          const chargeX = x + fontSize * 0.5;
          const chargeY = y - fontSize * 0.3;
          const smallFontSize = fontSize * 0.7;
          svgBody += svgText(
            chargeX,
            chargeY,
            chargeStr,
            color,
            smallFontSize,
            fontFamily,
          );
        }
      }
    }
  }

  svg += svgBody;
  svg += "</svg>\n";
  return { svg, width, height, errors: [] };
}
