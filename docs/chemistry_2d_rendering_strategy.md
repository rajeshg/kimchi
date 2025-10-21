# 2D Chemical Structure Layout Strategy

This document defines a procedural strategy for generating clear and aesthetically balanced 2D chemical structure diagrams.  
The algorithm operates in multiple passes, progressing from ring placement to bond completion and geometric optimization.

---

## Overview

### Goal
Generate a 2D coordinate layout from a molecular graph that:
- Preserves chemical correctness
- Emphasizes symmetry and balance
- Produces visually recognizable ring systems and substituent orientations

---

## Layout Pipeline

### Stage 1 — Identify and Place Rings

#### 1.1 Ring Detection
- Identify all rings and fused-ring clusters using a **cycle basis** or **SSSR** (Smallest Set of Smallest Rings) algorithm.
- Group **fused rings** into single composite ring systems.

#### 1.2 Ring Template Assignment
- Assign a **regular polygon** geometry for each independent ring:
  - 3-membered: equilateral triangle
  - 4-membered: square
  - 5-membered: regular pentagon
  - 6-membered: regular hexagon
- Normalize all bond lengths to a base unit (e.g., 1.0).

#### 1.3 Fused Ring Placement
- For fused rings:
  - Align shared bonds perfectly between polygons.
  - Merge adjacent ring coordinates into a single fused geometry.
- Maintain aromaticity (planar and symmetrical) across the fused cluster.
- Treat each fused cluster as a rigid “supernode” in subsequent layout.

**Rationale:** Rings form the visual and structural core of most organic molecules.  
**score_weight:** 1.0

---

### Stage 2 — Draw Connecting Bonds Between Rings

#### 2.1 Inter-Ring Bonds
- Identify all bonds connecting distinct ring systems.
- Arrange these bonds to:
  - Minimize edge crossings
  - Maintain roughly equal distances between ring clusters
  - Align connections along 30°, 45°, 60°, or 120° axes when possible

#### 2.2 Adjust Ring Orientation
- Rotate entire ring clusters to:
  - Reduce overlapping substituents
  - Create a visually balanced molecule
  - Preserve consistent bond lengths

**Rationale:** Connects the molecular cores before adding peripheral detail.  
**score_weight:** 0.9

---

### Stage 3 — Draw Chains, Branches, and Terminal Substituents

#### 3.1 Chain Expansion
- Starting from the ring clusters, traverse outwards through acyclic bonds.
- Place substituent atoms using idealized geometry:
  - sp³ centers: tetrahedral projection (approx. 109.5° → 90°/120° in 2D)
  - sp² centers: planar 120° separation
- Grow branches recursively until terminal atoms are reached.

#### 3.2 Branch Spacing
- Avoid collisions between branches and rings.
- Rotate branches slightly (±15°) if necessary to prevent overlap.
- Prefer outward and diagonal orientation from the molecular core.

**Rationale:** Builds the periphery after the core is stable.  
**score_weight:** 0.8

---

### Stage 4 — Fine-Tuning and Optimization

#### 4.1 Force Relaxation
- Apply a lightweight **spring or force-directed relaxation** to:
  - Equalize bond lengths
  - Minimize atom–atom overlap
  - Preserve ring planarity
- Exclude fused rings from heavy movement (treat as rigid units).

#### 4.2 Angle Regularization
- Snap final bond angles to nearest preferred values:
  - 30°, 45°, 60°, 90°, 120°, 150°, or 180°
- Recheck ring closure accuracy after snapping.

#### 4.3 Aesthetic Rotation
- Compute molecule’s **principal moment of inertia** to identify long axis.
- Rotate molecule so that the long axis is horizontal.
- Center molecule in the coordinate system.

#### 4.4 Scaling
- Adjust global scale so average bond length matches the target visual unit.

**Rationale:** Produces a clean, symmetric, and stable final diagram.  
**score_weight:** 1.0

---

## Optional Post-Processing

### Stage 5 — Label and Stereochemistry Placement
- Add atom labels, charges, and wedges **after** geometry is finalized.
- Position labels to avoid crossing bonds or overlapping rings.
- Orient wedges/dashes consistently across the molecule.

**Rationale:** Separation of geometry and annotation ensures clarity.  
**score_weight:** 0.7

---

## Summary of Pipeline

| Stage | Focus | Operations | Outcome |
|--------|--------|-------------|----------|
| 1 | Ring Core | Detect, regularize, and place rings | Stable geometric base |
| 2 | Core Connection | Draw bonds between ring systems | Connected skeleton |
| 3 | Branch Expansion | Add chains and side groups | Complete molecule |
| 4 | Optimization | Relax geometry, snap angles, center layout | Balanced structure |
| 5 | Annotation | Add text, charges, wedges | Final presentation |

---

## Optional Quality Metrics

To evaluate a layout, compute:

ayout_quality = weighted_sum([
ring_alignment,
bond_length_uniformity,
overlap_penalty,
symmetry_balance,
angular_regularization,
label_clearance
])


Weights can correspond to the `score_weight` fields above.

---

## Notes for Implementation (AI / Algorithmic Agents)

- Treat fused-ring clusters as rigid bodies in optimization.
- Cache ring templates to improve consistency across molecules.
- If the molecule has **no rings**, fall back to a **tree-layout** approach.
- Run optimization iteratively until positional delta < 0.01 units.
- Allow for human or model-based visual scoring feedback for fine-tuning.

---


