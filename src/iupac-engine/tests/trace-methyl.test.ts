import { IUPACNamer } from '../index';

const namer = new IUPACNamer();

test('trace methylbenzene', () => {
  const smiles = 'Cc1ccccc1';
  const { result, context } = (namer as any).generateNameFromSMILESWithContext(smiles);
  console.log('SMILES:', smiles);
  console.log('Final name:', result.name);
  const ps = context.getState().parentStructure;
  console.log('Parent structure:', ps?.type, ps?.name, 'assembled:', ps?.assembledName);
  console.log('Parent substituents:', ps?.substituents);
  expect(true).toBeTruthy();
});
