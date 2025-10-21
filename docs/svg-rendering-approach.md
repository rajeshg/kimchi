Perfect 🔬 — now that we have automatic 2D coordinate generation, let's wire up a **clean, chemically accurate SVG renderer** in **TypeScript**.

This will output crisp, ChemDraw-style 2D drawings:
→ bonds (single, double, triple, aromatic)
→ atoms (optional text labels)
→ stereo bonds (wedge/hash)
→ scalable static SVG

---

## 🧩 Design Goals

We'll make a `renderMoleculeToSVG()` that takes a **Molecule** (with no pre-computed coordinates) and returns SVG markup:

```ts
renderMoleculeToSVG(molecule: Molecule, opts?: SVGRendererOptions): string
```

The function will:
1. Generate 2D coordinates automatically (circular layout for components)
2. Render all bonds respecting `BondType` (single, double, triple, aromatic)
3. Handle stereo bonds (wedge/hash for chiral centers)
4. Intelligently show/hide atom labels
5. Return SVG as a string (embed in `dangerouslySetInnerHTML` or save as `.svg`)

---

## ⚙️ Implementation

```ts
import type { Molecule, Atom, Bond } from 'types';
import { BondType, StereoType } from 'types';

export interface SVGRendererOptions {
  showAtomLabels?: boolean;
  bondLength?: number;
  atomRadius?: number;
  fontSize?: number;
  strokeWidth?: number;
  colorScheme?: 'default' | 'monochrome';
}

export function renderMoleculeToSVG(
  molecule: Molecule,
  opts?: SVGRendererOptions
): string {
  // 1. Generate coordinates if needed
  const coordinates = generate2DCoordinates(molecule, opts.bondLength ?? 40);
  
  // 2. Calculate bounds
  const bounds = calculateBounds(coordinates);
  
  // 3. Render bonds first (so they appear behind atoms)
  const bondSVG = molecule.bonds.map(bond => renderBond(bond, coordinates, molecule, opts));
  
  // 4. Render atoms with optional labels
  const atomSVG = molecule.atoms.map(atom => {
    if (shouldShowLabel(atom, opts?.showAtomLabels)) {
      return renderAtom(atom, coordinates, opts);
    }
    return '';
  });
  
  // 5. Combine into SVG
  return buildSVG(bondSVG, atomSVG, bounds);
}
```

---

## 📋 Key Features

### Bond Rendering
- **Single bonds**: straight lines
- **Double bonds**: parallel offset lines
- **Triple bonds**: three parallel lines
- **Aromatic bonds**: alternating dashed/solid lines
- **Stereo bonds**: wedge (filled triangle) and hash (dashed lines)

### Atom Labels
- **Show**: heteroatoms, charged atoms, isotopes
- **Hide**: normal carbons (chemical convention)
- **Colors**: element-based (N=blue, O=red, etc.) or monochrome

### Coordinate Generation
- Automatic circular layout for disconnected components
- Scales based on number of atoms
- Uses fixed bond length (default 40 pixels)

---

## 🧬 Example Usage

```ts
import { parseSMILES, renderMoleculeToSVG } from 'index';

const result = parseSMILES('c1ccccc1');
const benzene = result.molecules[0];

const svg = renderMoleculeToSVG(benzene, {
  showAtomLabels: true,
  bondLength: 50,
  atomRadius: 8,
  fontSize: 14,
  colorScheme: 'default',
});

// svg is now a string ready to:
// → Embed in React: <div dangerouslySetInnerHTML={{ __html: svg }} />
// → Save to file: fs.writeFileSync('benzene.svg', svg)
// → Convert to PNG/PDF with a library
```

---

## 🧱 Output Structure

The function returns:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 180" width="200" height="180">
  <defs>
    <style>
      text { font-family: Arial, sans-serif; font-weight: bold; }
    </style>
  </defs>
  
  <!-- Bonds (lines/polygons) rendered first -->
  <line x1="50" y1="50" x2="100" y2="100" stroke="#000" stroke-width="1.5"/>
  ...
  
  <!-- Atoms with labels -->
  <circle cx="50" cy="50" r="6" fill="white" stroke="#0000FF"/>
  <text x="50" y="50" font-size="12" fill="#0000FF">N</text>
  ...
</svg>
```

---

## 🧠 Implementation Notes

| Consideration | Approach |
| --- | --- |
| Coordinate generation | Circular layout reusing mol-generator algorithm |
| Disconnected molecules | Render each component separately, offset horizontally |
| Aromatic rings | Use dashed lines for alternating bonds (alternating dashed/solid) |
| Atom visibility | Hide non-notable carbons; show heteroatoms & charged atoms |
| Stereo bonds | Wedge = filled polygon; Hash = dashed parallel lines |
| Scaling | viewBox auto-calculated from bounds + padding |

---
🧱 Output
The console output will be SVG like:

You can:
Render it in a browser (React, Astro, etc.)
Save it to disk as .svg
Export to PDF, PNG via any converter
