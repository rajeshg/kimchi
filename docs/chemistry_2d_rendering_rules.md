# Chemical 2D Structure Rendering Guidelines

This document defines rules and heuristics for generating clear, chemically accurate, and visually appealing 2D molecular structures.

The rules are grouped by category. Each rule includes a short rationale and an optional quality weight (`score_weight`) that can be used by automated layout systems or evaluation models.

---

## 1. Geometry and Layout

### Rule 1.1 — Bond Angles
- Default single bond angles:
  - sp² centers: 120°
  - sp³ centers: approximately 109.5°, simplified to 90° or 120° for clarity
- Avoid acute (< 60°) bond angles except in small rings.
- Maintain balanced symmetry around atoms.  
**Rationale:** Ensures realistic and legible geometry.  
**score_weight:** 0.9

### Rule 1.2 — Bond Lengths
- Keep bond lengths uniform across the molecule.
- Recommended normalized length: 1.0–1.2 units.
- Avoid stretched or compressed bonds.  
**Rationale:** Preserves consistent scale.  
**score_weight:** 0.8

### Rule 1.3 — Ring Geometry
- Draw regular polygons for rings (e.g., hexagons for benzene).
- Fused rings must share exact edge geometry.
- Avoid distortion or misalignment at fusion points.  
**Rationale:** Supports symmetry and recognizability.  
**score_weight:** 0.85

### Rule 1.4 — Spacing and Layout
- Maintain uniform spacing between atoms.
- Ensure no overlaps between bonds, labels, or hydrogens.
- Keep molecule centered and planar.  
**Rationale:** Improves readability.  
**score_weight:** 0.8

---

## 2. Bond Style and Representation

### Rule 2.1 — Bond Types
- Single: solid line  
- Double: two parallel lines, slightly spaced  
- Triple: three parallel lines, closer spacing  
**Rationale:** Standard visual differentiation.  
**score_weight:** 0.9

### Rule 2.2 — Stereochemistry
- Wedge (solid): bond toward viewer  
- Dashed wedge: bond away from viewer  
- Keep wedge orientation consistent across molecules.  
**Rationale:** Maintains consistent 3D perception.  
**score_weight:** 1.0

### Rule 2.3 — Aromatic Bonds
- Represent aromatic systems with either:
  - Alternating single/double bonds, or  
  - A circle inside the ring  
- Do not use both at once.  
**Rationale:** Prevents redundancy and clutter.  
**score_weight:** 0.7

---

## 3. Atom and Label Placement

### Rule 3.1 — Atom Symbols
- Use proper element capitalization (C, Cl, Br).  
- Omit carbon labels unless:
  - Attached to heteroatoms, or
  - Needed for clarity (e.g., t-butyl).  
**Rationale:** Reduces visual noise.  
**score_weight:** 0.8

### Rule 3.2 — Hydrogen Placement
- Hydrogens on carbons are implicit unless needed for clarity or stereochemistry.
- Explicitly show hydrogens on heteroatoms (OH, NH₂, etc.).  
**Rationale:** Matches chemical drawing conventions.  
**score_weight:** 0.8

### Rule 3.3 — Charges and Radicals
- Place charges as superscripts outside atom symbols (e.g., O⁻, NH₄⁺).
- Place unpaired electrons (•) evenly spaced from the atom.  
**Rationale:** Prevents overlap with bonds.  
**score_weight:** 0.7

### Rule 3.4 — Label Alignment
- Atom labels should remain horizontal (not rotated with bond).  
**Rationale:** Enhances text legibility.  
**score_weight:** 0.6

---

## 4. Visual Hierarchy and Clarity

### Rule 4.1 — Bond Thickness
- Maintain consistent bond thickness.
- Wedges should taper naturally.  
**Rationale:** Improves visual balance.  
**score_weight:** 0.8

### Rule 4.2 — Contrast and Color
- Default: black or dark-gray bonds.
- Use subtle color for highlights only (e.g., active sites).  
**Rationale:** Ensures readability in print and digital media.  
**score_weight:** 0.6

### Rule 4.3 — Layout Balance
- Center molecule in frame.
- Avoid bias toward one side.
- Prevent crossing bonds when possible.  
**Rationale:** Supports perceptual symmetry.  
**score_weight:** 0.85

---

## 5. Consistency Across Molecules

### Rule 5.1 — Global Style Consistency
- Within a document or batch, maintain:
  - Bond length and thickness
  - Font size and label style
  - Aromatic ring style
  - Wedge/dash conventions  
**Rationale:** Supports visual harmony across dataset.  
**score_weight:** 0.9

### Rule 5.2 — Simplification of Common Groups
- Use condensed notation for frequent fragments (Ph, Me, Et, etc.) if clarity is maintained.  
**Rationale:** Reduces redundancy in complex molecules.  
**score_weight:** 0.5

---

## 6. Algorithmic Considerations (for Auto-Layout Systems)

### Rule 6.1 — Layout Optimization
- Use a force-directed or spring layout for initial positioning.
- After layout convergence, **snap bond angles** to nearest of: 30°, 45°, 60°, 90°, 120°, or 180°.  
**Rationale:** Keeps geometry natural yet readable.  
**score_weight:** 1.0

### Rule 6.2 — Ring Regularization
- After layout, normalize all rings to regular polygons.  
**Rationale:** Removes minor distortions.  
**score_weight:** 0.9

### Rule 6.3 — Overlap Avoidance
- Perform a label–bond and label–label collision pass.
- Adjust atom coordinates minimally to resolve overlaps.  
**Rationale:** Prevents illegible renderings.  
**score_weight:** 0.9

---

## 7. Perceptual and Aesthetic Principles

### Rule 7.1 — Visual Simplicity
- Minimize crossings, crowded regions, and redundant bonds.
- Maintain even visual density.  
**Rationale:** Enhances quick comprehension.  
**score_weight:** 0.85

### Rule 7.2 — Orientation Preference
- Prefer horizontal or gently diagonal main chains.
- Avoid vertical alignment unless part of a ladder or polymer.  
**Rationale:** Feels more natural to the eye.  
**score_weight:** 0.7

### Rule 7.3 — Symmetry Preservation
- Preserve molecular symmetry whenever possible in layout.
- For asymmetric substitutions, rotate substructures instead of distorting rings.  
**Rationale:** Aids recognition and aesthetics.  
**score_weight:** 0.9

---

## 8. Output Validation Metrics (Optional)

When evaluating a generated structure, assign a **layout quality score** (0–1) using weighted average of rules above.

Example formula:

quality_score = Σ(rule_score × score_weight) / Σ(score_weight)

## Summary

A well-rendered 2D chemical structure:
- Has clean geometry and uniform bond lengths
- Represents stereochemistry consistently
- Avoids clutter and overlap
- Centers and balances the molecule visually
- Maintains stylistic consistency across all molecules in a set
