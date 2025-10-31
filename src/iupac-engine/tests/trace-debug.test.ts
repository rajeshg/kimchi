import { IUPACNamer } from '../index';

const namer = new IUPACNamer();

const cases = [
  { smiles: 'C1CCCCC1', label: 'cyclohexane' },
  { smiles: 'c1ccccc1', label: 'benzene' },
  { smiles: 'CC1CCCCC1', label: 'methylcyclohexane' },
  { smiles: 'CCC(C)C', label: '3-methylbutane (ambiguous)' },
  { smiles: 'C=CC=C', label: 'buta-1,3-diene' }
];

describe('IUPAC Engine Trace Debug', () => {
  it('prints execution trace for representative failing SMILES', () => {
    for (const c of cases) {
      console.log('\n--- TRACE for', c.label, c.smiles, '---');
      try {
        const { result, context } = namer.generateNameFromSMILESWithContext(c.smiles);
        console.log('Final name:', result.name);
        console.log('Parent structure type:', context.getState().parentStructure?.type);
        console.log('Parent name:', context.getState().parentStructure?.name);
        console.log('Candidate chains:', context.getState().candidateChains.length);
        console.log('Candidate rings:', context.getState().candidateRings.length);

        const history = context.getHistory();
        console.log('Rule execution count:', history.length);
        // Print any traces where parentStructure is set or candidate lists changed
        for (const trace of history) {
          const changedParent = trace.afterState.parentStructure !== trace.beforeState.parentStructure;
          const changedChains = trace.afterState.candidateChains !== trace.beforeState.candidateChains;
          const changedRings = trace.afterState.candidateRings !== trace.beforeState.candidateRings;
          if (changedParent || changedChains || changedRings) {
            console.log(`Rule: ${trace.ruleId} (${trace.ruleName}) phase=${trace.phase}`);
            if (changedParent) console.log('  -> parentStructure now:', trace.afterState.parentStructure?.name, trace.afterState.parentStructure?.type);
            if (changedChains) console.log('  -> candidateChains length:', trace.afterState.candidateChains.length);
            if (changedRings) console.log('  -> candidateRings length:', trace.afterState.candidateRings.length);
          }
        }
      } catch (err) {
        console.error('Trace run failed for', c.smiles, err);
      }
    }

    expect(true).toBeTruthy();
  });
});
