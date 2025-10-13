import sys
from rdkit import Chem

def canonical_smiles(smiles):
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return ''
    return Chem.MolToSmiles(mol, canonical=True)

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('')
        sys.exit(0)
    input_smiles = sys.argv[1]
    print(canonical_smiles(input_smiles))
