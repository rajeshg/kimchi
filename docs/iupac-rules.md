# IUPAC Blue Book Core Rules: Preferred IUPAC Name (PIN) Selection Hierarchy

This document summarizes the core, hierarchical rules from the IUPAC Blue Book (2013 Recommendations) used to determine the **Preferred IUPAC Name (PIN)**. These rules must be applied sequentially until a unique name can be established.

## 1. Nomenclature Method Seniority (P-51)

When a compound can be named using multiple types of nomenclature, the preference order is:

1.  **Substitutive** (Prefixes and suffixes added to a parent hydride). This is the default and most common method.
    
    -   _Example:_ `CH3-CH(OH)-CH3` is **propan-2-ol**.
        
2.  **Functional Class** (e.g., _ethyl chloride_, _diethyl ether_). This is preferred over Substitutive **only** for specific classes:
    
    -   **Esters:** `CH3COOCH3` is **methyl acetate** (not _methoxymethanone_).
        
    -   **Acid Anhydrides:** `(CH3CO)2O` is **acetic anhydride**.
        
    -   **Acyl Halides:** `CH3COCl` is **acetyl chloride**.
        
    -   **Pseudohalides:** `CH3CH2CN` (Propionitrile) can also be named as **ethyl cyanide**. (Substitutive is often preferred for PINs, but Functional Class is allowed).
        
    -   **Salts:** `CH3COONa` is **sodium acetate**.
        
3.  **Skeletal Replacement ('a')** (e.g., `oxa`, `thia`, `aza` for heteroatoms). Used when a chain or ring has heteroatoms, and is preferred over substitutive nomenclature for long chains or specific heterocyclic systems.
    
    -   _Example:_ `CH3-O-CH2-CH2-O-CH3` is **2,5-dioxahexane** (simpler than _1-methoxy-2-methoxyethane_).
        
4.  **Multiplicative** (Uses multiplying prefixes like _bis_, _tris_ to name identical subunits attached to a central linker, e.g., _2,2'-bipyridine_). This is preferred over simple substitutive nomenclature when applicable.
    
    -   _Example:_ `O(CH2-CH2-COOH)2` is **3,3'-oxydipropanoic acid**.
        
5.  **Conjunctive** (e.g., _benzeneacetic acid_). This is generally _not_ used for PINs.
    

## 2. Senior Parent Structure Selection (P-44)

The selection of the Parent Structure (ring or chain) is the most critical step, determined by the following criteria in decreasing order of priority.

### 2.1. Principal Characteristic Group (Functional Group Priority)

The parent structure is chosen to **contain the maximum number** of the principal characteristic group (the one cited as the **suffix**). This rule overrides all other length/size rules.

-   _Example 1:_ In `HO-CH2-CH(COOH)-CH2-COOH`, the principal group is Carboxylic Acid. The parent chain _must_ be the 4-carbon chain containing both -COOH groups (Butanedioic acid). The -OH is a prefix.
    
    -   **Name:** _2-hydroxybutane-1,4-dioic acid_ (Incorrect: _3-carboxy-2-hydroxypropanoic acid_, which only has one -COOH in the parent).
        
-   _Example 2:_ In `HOOC-CH2-CH(CH2-COOH)-CH2-CH2-COOH`, the principal group is Carboxylic Acid.
    
    -   **Path 1 (6C):** Longest chain is 6 carbons, but only contains 2 -COOH groups.
        
    -   **Path 2 (5C):** A 5-carbon chain contains all **3** -COOH groups.
        
    -   **Winner:** The 5-carbon chain (pentanedioic acid) wins because it contains the _maximum number_ (3) of the principal group, even though it's not the longest C-chain.
        
    -   **Note:** This structure is actually named **propane-1,2,3-tricarboxylic acid**, where the -COOH groups are _not_ part of the parent chain, as this allows all three to be treated equally. This is a special case (P-65.1.2.2). The _principle_ of maximizing the inclusion of the principal group (or treating them equally) is the key.
        
-   _Correct Example 2:_ `HOOC-CH(CH2CH3)-CH2-COOH`. The parent chain must contain both -COOH groups.
    
    -   **Winner:** The 4-carbon **butanedioic acid** chain. The ethyl group is a substituent.
        
    -   **Name:** _2-ethylbutane-1,4-dioic acid_.
        
-   **Note (Ring Suffixes):** If a group cannot be part of the parent chain/ring (e.g., -COOH on a ring), it uses a different suffix (e.g., _-carboxylic acid_, _-carbonitrile_, _-carbaldehyde_) and is still the principal group.
    
    -   _Example:_ A cyclohexane ring with a -COOH attached is **cyclohexanecarboxylic acid**.
        

**Seniority of Classes (Abbreviated):** | Priority Rank | Functional Group | Suffix | Prefix | | :---: | :--- | :--- | :--- | | **1 (Highest)** | **Acids** | | | | | Carboxylic Acid (-COOH) | -oic acid / -carboxylic acid | carboxy | | | Sulfonic Acid (-SO₃H) | -sulfonic acid | sulfo | | 2 | **Anhydrides** | -oic anhydride | (none) | | 3 | **Esters** (-COOR) | -oate / -carboxylate | alkoxycarbonyl | | 4 | **Acyl Halides** (-COX) | -oyl halide / -carbonyl halide | halocarbonyl | | 5 | **Amides** (-CONH₂) | -amide / -carboxamide | carbamoyl | | 6 | **Nitriles** (-C≡N) | -nitrile / -carbonitrile | cyano | | 7 | **Aldehydes** (-CHO) | -al / -carbaldehyde | oxo (or formyl) | | 8 | **Ketones** (>C=O) | -one | oxo | | 9 | **Alcohols** (-OH) | -ol | hydroxy | | 10 | **Amines** (-NH₂) | -amine | amino | | 11 | **Ethers** (-OR) | (N/A) | alkoxy | | 12 (Lowest) | **Halides, Nitro...** | (N/A) | halo, nitro |

### 2.2. Seniority of Ring Systems (P-44.2)

If the choice is between two ring systems (e.g., in a spiro or fused system):

1.  **Heterocycles > Carbocycles** (A ring with any heteroatom beats an all-carbon ring).
    
    -   _Example:_ _Pyridine_ (heterocycle) is senior to _Benzene_ (carbocycle).
        
2.  **Heteroatom Seniority:** For heterocycles, priority follows: **O > S > Se > Te > N > P > As > Sb > Bi > Si > Ge...**
    
    -   _Example:_ _Oxazole_ (contains O, N) is senior to _Thiazole_ (contains S, N) because O > S.
        
3.  **Number of Rings:** More rings are senior.
    
    -   _Example:_ _Naphthalene_ (2 fused rings) is senior to _Benzene_ (1 ring).
        
4.  **Ring Size:** The largest possible ring.
    
    -   _Example:_ _Quinoline_ (6+6 fused) is senior to _Indole_ (6+5 fused).
        
5.  **Heteroatom Locants:** Lowest locant set for heteroatoms.
    
    -   _Example:_ _1,2-Oxazole_ (locants 1,2) is senior to _1,3-Oxazole_ (locants 1,3).
        

### 2.3. Seniority of Acyclic Chains (P-44.3)

If the choice is between two chains (and 2.1 doesn't apply), these tie-breakers are used **in strict order**. This is a common failure point; do not skip or re-order these steps.

1.  **Max Length:** The **longest continuous chain** of skeletal atoms.
    
    -   _Example:_ A 6-carbon chain is _always_ senior to a 5-carbon chain, regardless of substituents.
        
2.  **Max Multiple Bonds:** If length is equal, the chain with the **greatest number of multiple bonds** ($=$ and $\equiv$).
    
    -   _Example:_ A 5C chain with 2 double bonds > a 5C chain with 1 double bond.
        
3.  **Max Double Bonds:** If still tied, the chain with the **greatest number of double bonds**.
    
    -   _Example:_ A 5C chain with 2 double bonds > a 5C chain with 2 triple bonds.
        
4.  **Lowest Locant Set (Multiple Bonds):** If still tied, the chain with the **lowest locant set** for multiple bonds.
    
    -   _Example:_ A chain numbered `...-1,3-diene` > a chain numbered `...-1,4-diene`.
        
5.  **Lowest Locant Set (Double Bonds):** If still tied, the chain with the **lowest locant set** for double bonds.
    
6.  **Max Substituents:** If still tied, the chain with the **greatest number of substituents** (prefixes).
    
    -   _Correct Debug Example (Rule 6):_ `CH3-CH2-CH(CH(CH3)2)-CH(CH3)-CH2-CH3`
        
        -   **Path 1 (Hexane):** 6-carbon chain `C-C-C-C-C-C` (the linear one). Has **2 substituents** (_isopropyl_ at 3, _methyl_ at 4).
            
        -   **Path 2 (Hexane):** 6-carbon chain (go into isopropyl): `(CH3)2CH-CH(R)-CH(CH3)-...` -> `C-C(C)-C(R)-C(Me)-C-C`. Length=6. Has **3 substituents** (_methyl_ at 2, _methyl_ at 3, _ethyl_ at 4). -> `2,3-dimethyl-4-ethylhexane`.
            
        -   **Winner:** Path 2 (**Hexane**) wins. Both paths have Max Length 6 (Rule 1 is a tie). Both have 0 multiple bonds (Rules 2-5 are ties). Path 2 wins by Rule 6 (Max Substituents) (3 vs 2).
            
7.  **Lowest Locant Set (Substituents):** If still tied, the chain with the **lowest locant set** for all substituents.
    
    -   _Example:_ A 7-carbon chain with substituents at 2, 4, 5. Numbering from the other end gives 3, 4, 6.
        
    -   **Comparison:** `(2,4,5)` vs `(3,4,6)`.
        
    -   **Winner:** `(2,4,5)` wins because `2` is lower than `3` at the first point of difference.
        
8.  **Lowest Alphabetical Locant:** If still tied, the chain that gives the **lowest locant to the prefix cited first** in the name.
    
    -   _Example:_ In `3-ethyl-4-methylhexane`, numbering from the other end gives `3-methyl-4-ethylhexane`. The locant sets are identical (`3,4`). `Ethyl` comes before `methyl` alphabetically, so it must get the lower locant. **3-ethyl-4-methylhexane** is correct.
        

### 2.4. Ring vs. Chain Criteria (P-44.4)

If the principal group is on both/neither, or there is no principal group:

1.  **Chain Length vs. Ring Size:** Select the component (ring system or chain) with the **greater number of skeletal atoms (carbons)**.
    
    -   _Example 1 (Chain > Ring):_ `C6H11-CH2-CH2-CH2-CH2-CH2-CH2-CH3` (1-cyclohexylheptane).
        
        -   **Chain:** 7 carbons. **Ring:** 6 carbons.
            
        -   **Winner:** The **Heptane** chain is the parent (7 > 6). The ring is a _cyclohexyl_ prefix.
            
    -   _Example 2 (Ring > Chain):_ `C7H13-CH2-CH3` (ethylcycloheptane).
        
        -   **Chain:** 2 carbons. **Ring:** 7 carbons.
            
        -   **Winner:** The **Cycloheptane** ring is the parent (7 > 2).
            
2.  **Tie-breaker (Equal Size):** If the number of skeletal atoms is equal, the **ring system** is chosen as the parent structure.
    
    -   _Example:_ `C6H11-CH2-CH2-CH2-CH2-CH2-CH3` (hexylcyclohexane).
        
        -   **Chain:** 6 carbons. **Ring:** 6 carbons.
            
        -   **Winner:** The **Cyclohexane** ring is the parent (tie-breaker). The chain is a _hexyl_ prefix.
            

## 3. Parent Structure Numbering (Locant Priority) (P-14.4)

The set of locants (position numbers) is determined by choosing the numbering that yields the **lowest number at the first point of difference**, based on the following hierarchy:

1.  **Fixed Locants:** Use fixed locants if present (e.g., in fused systems like _Naphthalene_ where C1 is fixed).
    
    -   _Example:_ `1-nitronaphthalene` (not 8-nitronaphthalene).
        
2.  **Indicated Hydrogen:** (For heterocycles) Assign the lowest locant to indicated Hydrogen (e.g., _1H-pyrrole_).
    
3.  **Principal Group (Suffix):** Assign the **lowest possible locant(s)** to the principal characteristic group (suffix).
    
    -   _Example:_ `CH3-CH(OH)-CH2-CH2-CH3` is **pentan-2-ol** (not pentan-4-ol).
        
4.  **Multiple Bonds:** Assign the **lowest possible locant(s)** to multiple bonds ($=$ and $\equiv$).
    
    -   _Example:_ `CH2=CH-CH2-CH2-CH3` is **pent-1-ene** (not pent-4-ene).
        
    -   **Tie-breaker:** If a choice remains, **double bonds** ($=$) are given lower locants than triple bonds ($\equiv$).
        
        -   _Example:_ `CH2=CH-CH2-C≡CH` is **pent-1-en-4-yne**. (Locants are `1,4`). Numbering from the right gives `pent-4-en-1-yne` (Locants `1,4`). It's a tie. The double bond gets the lower locant (`1` vs `4`). **pent-1-en-4-yne** is correct.
            
5.  **Prefixes (Substituents):** Assign the **lowest possible locant(s)** to all prefixes (substituents).
    
    -   _Example:_ `CH3-CH(Cl)-CH2-CH(Br)-CH3`.
        
        -   Left-to-Right: `4-bromo-2-chloropentane` (Locants `2,4`).
            
        -   Right-to-Left: `2-bromo-4-chloropentane` (Locants `2,4`).
            
        -   The locant sets are identical. Proceed to rule 6.
            
6.  **Alphabetically First Prefix:** If the locant sets are still identical (like the example above), choose the numbering that gives the **lowest locant to the substituent cited first** in the alphabetical part of the name.
    
    -   _Example (cont.):_ `bromo` comes before `chloro` alphabetically. It must get the lower locant.
        
    -   **Winner:** **2-bromo-4-chloropentane** (gives `2` to _bromo_).
        

## 4. Name Construction and Alphabetization

### 4.1. Name Assembly

The final name is assembled as: `Locants and Prefixes (alphabetized)` + `Parent Hydride Name` + `Locants and Suffix`

### 4.2. Alphabetization Rules (P-14.4)

All prefixes are placed in alphabetical order.

1.  **Ignore Prefixes for Alphabetization:**
    
    -   Multiplicative prefixes: `di-`, `tri-`, `tetra-`, `penta-`, etc.
        
    -   Non-detachable prefixes: `sec-`, `tert-`.
        
    -   Stereochemical prefixes: `cis-`, `trans-`, `E-`, `Z-`, `R-`, `S-`.
        
    -   _Example:_ `3-ethyl-2,2-dimethylpentane`. Alphabetize `e` (ethyl) vs `m` (methyl). **`e` comes first.**
        
2.  **Include Prefixes for Alphabetization:**
    
    -   `iso-` (e.g., _isopropyl_ comes before _methyl_).
        
    -   `neo-` (e.g., _neopentyl_).
        
    -   `cyclo-` (e.g., _cyclohexyl_ comes before _methyl_).
        
    -   _Example:_ `1-cyclohexyl-2-isopropylpentane`. Alphabetize `c` (cyclohexyl) vs `i` (isopropyl). **`c` comes first.**
        
3.  **Complex Substituents:**
    
    -   For complex prefixes like `bis-`, `tris-`, `tetrakis-`, the prefix itself is ignored.
        
    -   Alphabetization is based on the **first letter of the complex name inside the parentheses**.
        
    -   _Example:_ `bis(methylamino)` is alphabetized under 'm'. `bis(1,1-dimethylethyl)` is alphabetized under 'd'.
        

### 4.3. Enclosing Marks (P-16.5)

Parentheses `( )`, brackets `[ ]`, and braces `{ }` are used to enclose parts of a name to avoid ambiguity. The nesting order is: `( )` $\to$ `[ ( ) ]` $\to$ `{ [ ( ) ] }`.

-   Used for complex substituents: e.g., `5-(1,2-dimethylpropyl)decane`.
    
-   Used for `bis-`, `tris-`: e.g., `bis(2-hydroxyethyl)amine`.
    
-   Used to separate locants: e.g., `benzo[a]pyrene`.
    

## 5. Ring Systems and Aromaticity

### 5.1. Benzene Derivatives (P-25)

-   **Retained Names:** Benzene derivatives with principal groups often have retained PINs (e.g., _Phenol_ for C₆H₅-OH, _Benzoic acid_ for C₆H₅-COOH, _Aniline_ for C₆H₅-NH₂). These are the senior parent hydrides.
    
-   **Substituent Rules:** If a side chain attached to benzene has more carbons than the ring (i.e., > 6) AND the principal functional group is on the chain, the chain becomes the parent (e.g., _1-phenylheptan-2-ol_).
    

### 5.2. Polycyclic Systems (P-24/P-25)

-   **Fused Rings:** Named based on a set of retained names (e.g., _Naphthalene_, _Anthracene_, _Phenanthrene_) or by systematic fusion nomenclature (e.g., _benzo[a]pyrene_).
    
-   **Bridged Rings (Bicyclo):** Named using the `bicyclo[x.y.z]alkane` system.
    
    -   `x`, `y`, and `z` are the number of non-bridgehead atoms in the three paths connecting the two bridgeheads, in decreasing order (`x >= y >= z`).
        
    -   _Example:_ _Norbornane_ is **bicyclo[2.2.1]heptane**. (x=2, y=2, z=1).
        
    -   Numbering starts at one bridgehead, proceeds along the longest bridge (`x`), continues along the next longest (`y`), and finishes across the shortest (`z`).
        
-   **Spiro Systems (Spiro):** Named using the `spiro[x.y]alkane` system.
    
    -   `x` and `y` are the number of atoms in each ring, _excluding_ the shared spiro atom, in increasing order (`x <= y`).
        
    -   _Example:_ **spiro[2.4]heptane**. (A 3-membered ring and a 5-membered ring sharing one C). `x=2`, `y=4`.
        
    -   Numbering starts in the smaller ring (`x`) adjacent to the spiro atom and proceeds around that ring, then crosses the spiro atom to number the larger ring (`y`).
        

## 6. Special Cases & Debugging Common Failures

This section addresses the specific failure cases provided.

### 6.1. Case 4: `CC(C)C(C(C(C)C)C)C`

-   **Problem:** Failure to select the correct parent chain in a highly branched alkane.
    
-   **Rule:** This tests the strict hierarchy of **Section 2.3 (Seniority of Acyclic Chains)**.
    
-   **Analysis:** Your algorithm is likely selecting a 5-carbon chain because it appears "simpler" or has a "central" substituent. This is incorrect.
    
-   **Hierarchy:**
    
    1.  **Rule 2.3.1 (Max Length):** You must _first_ find all chains of the absolute maximum length.
        
        -   SMILES: `CC(C)C(C(C(C)C)C)C` (3-(1,2-dimethylpropyl)-2-methylbutane)
            
        -   Longest Chain: 6 carbons (e.g., `C-C(C)-C(Sub)-C` -> `C-C(C)-C-C(C)-C`). This is `2,3,4-trimethylhexane`.
            
    2.  **Rule 2.3.6 (Max Substituents):** This rule is a **TIE-BREAKER**. It _only_ applies if two or more chains have the _same_ maximum length (and same number of multiple bonds, etc.). It can **never** be used to select a shorter chain (e.g., a 5-carbon chain) over a longer one (a 6-carbon chain).
        
-   **Solution:** Ensure your algorithm _never_ considers the number of substituents (Rule 2.3.6) _until after_ it has filtered all candidate chains for the maximum possible length (Rule 2.3.1). For this SMILES, the parent chain length is **6**.
    

### 6.2. Case 12: `CC1CC(C)C(C(C)C)C1`

-   **Problem:** Ambiguity between ring and chain parent.
    
-   **Rule:** This tests **Section 2.4 (Ring vs. Chain Criteria)**.
    
-   **Analysis:**
    
    -   SMILES: `1,3-dimethyl-4-isopropylcyclohexane`.
        
    -   **Ring:** 6 carbons.
        
    -   **Longest Acyclic Chain:** 3 carbons (the _isopropyl_ group).
        
    -   **Rule 2.4.1 (Chain vs. Ring Size):** Compare the number of skeletal atoms.
        
        -   Ring (6) > Chain (3).
            
    -   **Winner:** The **ring** (Cyclohexane) is the parent structure. The parent length is 6.
        
-   **Solution:** Ensure your chain-finding algorithm does not "traverse" ring bonds. The chains to be compared are _only_ the substituents attached to the ring. The ring is the parent because 6 > 3.
    

### 6.3. Case 13: `C1CC(C2CCCCC2)CCCC1`

-   **Problem:** Two rings attached by a single bond.
    
-   **Rule:** This is a **Ring Assembly** (P-28). It is not fused, bridged, or spiro.
    
-   **Analysis:**
    
    -   SMILES: `(Cyclohexyl)cyclooctane`.
        
    -   **Ring 1:** Cyclooctane (8 carbons).
        
    -   **Ring 2:** Cyclohexane (6 carbons).
        
-   **Solution:** For a simple ring assembly, the parent structure is the **largest ring**.
    
    -   **Winner:** The **Cyclooctane** (8 carbons) is the parent. The 6-carbon ring is a substituent, named _cyclohexyl_.
        
    -   The parent length is 8. Add this check to your ring-vs-ring logic.
        

### 6.4. Case 20: `CC(=O)NC(=O)C` & Case 21: `CC(=O)OC(=O)C`

-   **Problem:** These are not hydrocarbons; they are **Functional Parent Compounds**.
    
-   **Rule:** The parent structure is not a simple carbon chain, but is defined by the functional group itself.
    
-   **Case 20 (Imide):** `CC(=O)-NH-C(=O)C`
    
    -   The parent acid is _acetic acid_.
        
    -   The parent imide is _diacetamide_.
        
    -   For PINs, this is named substitutively on the parent _amide_: **N-acetylacetamide**.
        
    -   The parent structure is `acetamide` (2-carbon parent).
        
-   **Case 21 (Anhydride):** `CC(=O)-O-C(=O)C`
    
    -   This is a symmetrical **anhydride**.
        
    -   The PIN is based on the parent acid: **acetic anhydride**.
        
-   **Solution:** Your algorithm must have a pre-selection step to identify specific functional classes (like Anhydrides, Imides, Esters per Section 1.2) that use **Functional Class** or **Functional Parent** names, _before_ attempting to find a hydrocarbon chain. The parent chain is not the "longest chain of carbons" in these cases.
    

### 6.5. Case 37: `C1=CC=C2C3=CC=CC=C3C=C12`

-   **Problem:** Fused polycyclic aromatic hydrocarbon (PAH).
    
-   **Rule:** This is a **Retained Name** (P-25.1).
    
-   **Analysis:**
    
    -   SMILES: `Phenanthrene`.
        
    -   The systematic name `bicyclo[...]` is incorrect. The name `Phenanthrene` is a **mandatory retained name** for the PIN.
        
-   **Solution:** Your implementation _must_ have a lookup table of retained names for common PAHs (e.g., Naphthalene, Anthracene, Phenanthrene, Pyrene, etc.). If a structure matches one of these, the retained name _must_ be used as the parent structure. The parent length is 14.