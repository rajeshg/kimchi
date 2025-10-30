# **Specification: SMILES-to-IUPAC-Name Generator**

This document outlines the high-level specification and algorithmic approach for building a IUPAC name generator.

**Core Assumption:** A SMILES parser already exists. This parser takes a SMILES string and outputs a MolecularGraph (see Data Structures) where all implicit hydrogens are explicit, and stereocenters/bonds are (ideally) pre-calculated.

## **1\. Phased Implementation Plan**

Implement the system in logical milestones. Each milestone builds upon the last and tackles a specific chapter of nomenclature.

* **Milestone 1: Acyclic Alkanes & Alkyl Substituents**  
  * **Goal:** Correctly name "2,2,4-trimethylpentane".  
  * **Focus:** This is the core engine. It requires perfecting **Step 3 (Chain Finding)**, **Step 4 (Recursive Substituent Naming)**, and **Step 6 (Name Assembly)**.  
  * **Hint:** Focus on graph traversal (DFS) to find all paths, complex filtering logic to select the *correct* path, and recursive calls for naming branches.  
* **Milestone 2: Alkenes & Alkynes**  
  * **Goal:** Name "hex-2-ene" or "hex-1-en-4-yne".  
  * **Focus:** Update the priority rules in **Step 3**. The principal chain *must* contain the maximum number of double/triple bonds, even if it's not the longest chain. Numbering must give them the lowest locants.  
* **Milestone 3: Simple Monocyclic Systems**  
  * **Goal:** Name "1,2-dimethylcyclohexane".  
  * **Focus:** Implement a ring-finding algorithm (e.g., Smallest Set of Smallest Rings \- SSSR) in **Step 2**. Implement ring-numbering logic in **Step 3**.  
* **Milestone 4: Single Functional Groups**  
  * **Goal:** Name "propan-2-ol", "cyclohexanone", "pentanoic acid".  
  * **Focus:** Build the **Functional Group Database (see Databases)**. This database *drives* all logic. **Step 1 (PFG ID)** is now active. **Step 3 (Numbering)** priority is now dominated by the PFG.  
* **Milestone 5: Polyfunctional Compounds & Stereochemistry**  
  * **Goal:** Name "(R)-3-chloro-4-hydroxypentanoic acid".  
  * **Focus:** This tests the *seniority* logic of **Step 1** (acid \> alcohol \> halo). It also implements **Step 5 (Stereo)**, which formats the pre-calculated R/S/E/Z labels.  
* **Milestone 6+ (The Long Tail):**  
  * **Focus:** Advanced systems, each a major sub-project:  
    * Fused rings (e.g., "naphthalene")  
    * Bridged systems (e.g., "norbornane")  
    * Heterocycles (e.g., "pyridine")  
    * Retained names ("toluene", "aniline")

## **2\. Core Data Structures**

### **Input: Molecular Graph (from SMILES Parser)**

/\*\* The entire molecular graph \*/  
type MolecularGraph \= GraphAtom\[\];

/\*\* Represents a single atom in the graph \*/  
interface GraphAtom {  
  id: number;          // Unique ID (e.g., array index)  
  element: string;     // 'C', 'O', 'Cl', etc.  
  charge: number;        // Formal charge  
  neighbors: GraphNeighbor\[\]; // All connections

  /\*\*  
   \* Assumed to be provided by the parser via  
   \* Cahn-Ingold-Prelog (CIP) calculation.  
   \* This is a non-trivial assumption.  
   \*/  
  cipStereo?: 'R' | 'S';  
}

/\*\* Represents a connection (bond) from one atom to another \*/  
interface GraphNeighbor {  
  atomId: number;      // ID of the atom this connects to  
  bondOrder: 1 | 2 | 3;

  /\*\*  
   \* Assumed to be provided by the parser.  
   \*/  
  cipStereo?: 'E' | 'Z';  
}

### **Internal: Naming Structures**

/\*\* Represents the chosen and numbered main chain or ring \*/  
interface ParentStructure {  
  /\*\*  
   \* The final numbering.  
   \* Map\<atomId, locantNumber\>  
   \* e.g., { atom(4) \=\> 1, atom(7) \=\> 2, ... }  
   \*/  
  numbering: Map\<number, number\>;  
  length: number;      // e.g., 6 for "hex"  
  isRing: boolean;  
  // TODO: Add unsaturation locants  
}

/\*\* Represents a single substituent found on the parent \*/  
interface IdentifiedSubstituent {  
  locant: number;      // The number where it's attached (e.g., 2\)  
  name: string;        // The name (e.g., "methyl", "chloro")  
  sortKey: string;     // Key for alphabetizing (e.g., "methyl" for "dimethyl")  
  isComplex: boolean;  // true for "(1-methylethyl)"  
}

## **3\. Rule Databases (The "Knowledge Base")**

This is the static data that encodes the IUPAC rules.

* **FUNCTIONAL\_GROUP\_DB**  
  * **Description:** The most critical database. Encodes functional group seniority.  
  * **Schema:** (subgraph\_pattern, seniority\_rank, suffix\_name, prefix\_name)  
  * **Example Entry:** ('\[C\](=O)O', 1, '-oic acid', 'carboxy-')  
  * **Hint:** The subgraph\_pattern is best stored as a SMARTS string, which your subgraph-matching algorithm (see Step 1\) will use.  
* **ALKANE\_ROOT\_DB**  
  * **Description:** Maps chain length to root name.  
  * **Schema:** (length, root\_name)  
  * **Example Entry:** (6, 'hex'), (20, 'icos')  
* **SUBSTITUENT\_PREFIX\_DB**  
  * **Description:** Simple element/group prefixes.  
  * **Schema:** (element\_or\_group\_formula, prefix\_name)  
  * **Example Entry:** ('Cl', 'chloro'), ('NO2', 'nitro')  
* **MULTIPLIER\_PREFIX\_DB**  
  * **Description:** Prefixes for simple counts.  
  * **Schema:** (count, prefix)  
  * **Example Entry:** (2, 'di'), (3, 'tri'), (4, 'tetra')  
  * **Note:** You also need a separate map for complex substituents: (2, 'bis'), (3, 'tris').

## **4\. Core Naming Algorithm (The "Specification")**

This is the step-by-step process to execute.

### **Step 1: Pre-Analysis & PFG Identification**

* **Goal:** Find all functional groups and identify the single "Principal Functional Group (PFG)" based on seniority.  
* **Algorithm/Approach Hint:**  
  1. Use a **subgraph isomorphism algorithm** (e.g., Ullmann's algorithm or a simpler backtracking/DFS-based search).  
  2. Iterate through your FUNCTIONAL\_GROUP\_DB from *highest* priority to lowest.  
  3. Run the subgraph search for each pattern on the MolecularGraph.  
  4. The *first* group you find (which will be the one with the highest seniority) is the **PFG**.  
  5. All other functional groups found are now considered "substituents" and will use their prefix\_name.

### **Step 2: Determine Parent Structure Type**

* **Goal:** Decide if the main scaffold is an acyclic chain or a ring system.  
* **Algorithm/Approach Hint:**  
  1. This is a high-level **decision tree** based on the PFG.  
  2. if (PFG): Find the structure that contains the PFG. If the PFG atom is *in* a ring, the parent is the ring. If it's on a chain attached to a ring, rules in Chapter 4 decide (usually the one with the PFG is the parent).  
  3. if (no PFG): The parent will be the "principal chain" (Step 3\) or main ring system.  
  4. **Note:** This step identifies the *type* of parent. Step 3 finds the *specific* parent.

### **Step 3: Identify & Number Principal Chain / Ring**

This is the most complex step. It's a two-part process: (A) selecting the best chain/ring and (B) numbering it correctly.

* **Part A: Chain/Ring *Selection***  
  * **Goal:** From all possible paths, find the single "principal" one.  
  * **Algorithm/Approach Hint:** This is a **multi-stage filtering process**.  
    1. **Find all paths:** Use a **Depth-First Search (DFS)** starting from every chain-terminating atom (\-CH3) or ring atom to find all possible simple paths in the graph.  
    2. **Filter 1 (PFG):** Keep only paths that contain the PFG's atoms. (Skip if no PFG).  
    3. **Filter 2 (Unsaturation):** From the remaining, keep only paths with the *maximum* number of double/triple bonds.  
    4. **Filter 3 (Length):** From the remaining, keep only paths of *maximum length*.  
    5. **Filter 4 (Substituents):** From the remaining, keep only paths with the *maximum* number of substituents.  
    6. **... (More tie-breakers):** Continue with lowest locants for unsaturation, then lowest locants for substituents, etc., as defined by the Blue Book.  
* **Part B: Chain/Ring *Numbering***  
  * **Goal:** Apply the correct 1, 2, 3... numbering to the chosen path.  
  * **Algorithm/Approach Hint:** This is a **comparison process**.  
    1. For the winning path(s) from Part A, generate the two possible numberings (forward and reverse).  
    2. For each numbering, generate a "locant set" (a sorted list of numbers) for all features, in order of priority:  
       \[PFG locant, unsaturation locants, substituent locants\]  
       (e.g., \[1, 4, 2, 2, 5\] for a PFG at 1, double bond at 4, and substituents at 2, 2, and 5\)  
    3. Compare the locant sets from the two directions. The "lowest" set wins.  
    4. **"Lowest" Rule:** Compare number-by-number. The first point of difference decides (e.g., \[1, 3, 5\] is lower than \[1, 4, 2\]).  
    5. Store the winning numbering in a Map\<atomId, locant\> as the ParentStructure.

### **Step 4: Identify & Name Substituents**

* **Goal:** Find and name everything attached to the parent *that is not* part of the parent.  
* **Algorithm/Approach Hint:**  
  1. Iterate over all atoms in the ParentStructure.  
  2. For each atom, check its neighbors. Any neighbor *not* in the ParentStructure.numbering map is a substituent.  
  3. **Simple Substituents:** If the substituent is just \-Cl or \-F, look up its name in SUBSTITUENT\_PREFIX\_DB.  
  4. Complex Substituents (Recursion): If the substituent is an alkyl chain (e.g., \-CH(CH3)2), you must:  
     a. Create a "sub-graph" of the substituent.  
     b. Recursively call this entire naming algorithm (Steps 3-4) on that sub-graph.  
     c. In this recursive call, the attachment point to the main parent is forced to be locant 1\.  
     d. The result will be a name like "1-methylethyl".  
     e. The final name is constructed as (1-methylethyl). The isComplex flag is set to true.  
  5. Store all found substituents in a list of IdentifiedSubstituent objects.

### **Step 5: Identify Stereochemistry**

* **Goal:** Get the locants for all R/S/E/Z descriptors.  
* **Algorithm/Approach Hint:**  
  1. This step assumes your parser already identified the stereodescriptors.  
  2. Iterate through all atoms in your MolecularGraph.  
  3. If atom.cipStereo exists (e.g., 'R'):  
     a. Look up its locant in the ParentStructure.numbering map.  
     b. Store (locant, 'R').  
  4. Do the same for bonds (neighbor.cipStereo) to get (locant, 'E').  
  5. Store all found descriptors.

### **Step 6: Assemble the Final Name String**

* **Goal:** Combine all the pieces into the final IUPAC name.  
* **Algorithm/Approach Hint:** This is a **string-building** and **sorting** step.  
  1. **Group Substituents:** Convert your IdentifiedSubstituent\[\] into a Map\<name, locants\[\]\>.  
     * Example: {"methyl": \[2, 3\], "chloro": \[4\]}  
  2. **Create Prefix Parts:** Iterate the map.  
     * "methyl", \[2, 3\] \-\> prefix \= MULTIPLIER\_PREFIX\_DB\[2\] \-\> "2,3-dimethyl"  
     * "chloro", \[4\] \-\> "4-chloro"  
     * Store these as objects: { sortKey: 'methyl', part: '2,3-dimethyl' }, { sortKey: 'chloro', part: '4-chloro' }  
  3. **Alphabetize:** Sort your list of prefix parts by sortKey.  
  4. **Get Parent Root:** ALKANE\_ROOT\_DB\[parent.length\] (e.g., "hex")  
  5. **Get Suffixes:** Get the unsaturation part (e.g., "-2-en-4-yne") and the PFG suffix (e.g., "-1-ol").  
  6. **Apply Elision:** Apply vowel-dropping rules (e.g., hexane \+ \-ol \-\> hexan-ol).  
  7. Concatenate: Assemble all parts in the correct order:  
     (Stereo\_Prefixes)-(Substituent\_Prefixes)(Parent\_Root)(Unsaturation\_Suffix)(PFG\_Suffix)  
     * Example: (2R, 4E)- 4-chloro-2,3-dimethyl hex \-4-en- 1-ol