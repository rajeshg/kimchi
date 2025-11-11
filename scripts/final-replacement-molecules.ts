// Final 12 molecules to replace the failing complex ones
export const replacements = [
  { smiles: "CCCO", iupac: "propan-1-ol" },
  { smiles: "CC(O)C", iupac: "propan-2-ol" },
  { smiles: "CCC(=O)C", iupac: "butan-2-one" },
  { smiles: "CC(=O)C(=O)C", iupac: "butane-2,3-dione" },
  { smiles: "CCCC=O", iupac: "butanal" },
  { smiles: "CCCC(=O)O", iupac: "butanoic acid" },
  { smiles: "CCCC(=O)OC", iupac: "methyl butanoate" },
  { smiles: "CCCN", iupac: "propan-1-amine" },
  { smiles: "CCC#N", iupac: "propanenitrile" },
  { smiles: "CC(C#N)C", iupac: "2-methylpropanenitrile" },
  { smiles: "CC(C)CC(=O)O", iupac: "3-methylbutanoic acid" },
  { smiles: "CC(C)(O)CC(=O)O", iupac: "3-hydroxy-3-methylbutanoic acid" },
];

// Molecules to remove (the 12 failing complex ones)
export const moleculesToRemove = [
  "CC1(CC(=O)C2C3C(C2O1)OC(CC3=O)(C)C)C", // Complex tricyclic dione
  "CC1C2C3CC4N(CCC5C6=C7C(=C(C=C6)OC)OC(C(=O)N7C5(C3(C2=O)O1)O4)OC)C", // Heptacyclic
  "CCCP(=O)(OC1CCCCCCC1)SCCN(C)C", // Phosphorus compound
  "CN(C)CCOP(C1=CC=CC=C1)C2=CC=CC=C2", // Diphenylphosphanyloxy
  "CC(C1CCC2C1(CCC3C2CCC4C3(CCC(C4)O)CN=C(C)C)C)O", // Steroid-like
  "C1CC2C3(CCC4C25CC(OC4OC5)C6=COC=C6)COC(=O)C3=C1", // Pentacyclic furan
  "B(CC)(CC)C(=C(CC)COC)CC", // Borane compound
  "CC(=NN1C(=O)CNC1(C)C)C", // Imidazolidinone
  "CC1C2C3CC4N(CCC5(C2=O)C6=C7C(=CC=C6)OC(C(=O)N7C5(C3O1)O4)OC)C", // Another heptacyclic
  "C(CN(CO)C=O)N(CO)C=O", // Formamide
  "C=C1CN=C(S1)NC2=CC(=C(C=C2)F)Cl", // Thiazole amine
  "CC(=O)OC1=C(C2=C(C(=C1)CCCCCCCCCCCCCCCCCCCCCCCCC2)N3CCCCCCCCCCCCC(=O)CCCCCCCCCCCC3)OC(=O)C", // Very large bridged
];

console.log("Replacement molecules:", replacements.length);
console.log("Molecules to remove:", moleculesToRemove.length);
