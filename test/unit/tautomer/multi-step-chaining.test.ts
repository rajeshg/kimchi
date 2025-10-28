import { parseSMILES } from 'index';
import { enumerateTautomers } from 'src/utils/tautomer/tautomer-enumerator';
import tautomerRules from 'src/utils/tautomer/tautomer-rules';

describe('tautomer: multi-step chaining', () => {
  it('should produce chained tautomers for pentane-2,4-dione', () => {
  const parsed = parseSMILES('CC(=O)CH2C(=O)C');
  if (!parsed || !parsed.molecules || parsed.molecules.length === 0) throw new Error('Failed to parse SMILES');
  const mol = parsed.molecules[0]!;
  // Debug: print atom symbols and IDs
  // @ts-ignore
  console.log('Parsed atoms:', mol.atoms.map(a => `${a.symbol}${a.id}`).join(' '));
    const tautomers = enumerateTautomers(mol, { maxTautomers: 128, phases: [1,2] });
    if (tautomers.length === 0) throw new Error('No tautomers produced');
    const someChained = tautomers.find(t => (t.ruleIds || []).length >= 2);
    if (!someChained) {
      throw new Error('No chained tautomers found; produced smiles: ' + tautomers.map(t => `${t.smiles}:${(t.ruleIds||[]).join(',')}`).join('; '));
    }
  });
});
