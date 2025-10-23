// Simple CommonJS mock runtime for InChI adapter
// Exports multiple shapes to exercise the wrapper's resolution logic

function InchiFromMolfile_sync(molfile) {
  // Return a plain string for one test path
  return `MOCK-INCHI-STRING:${molfile.slice(0,20).replace(/\n/g,'')}`;
}

async function InchiFromMolfile_async(molfile) {
  // Return an object shape for another test path
  return { inchi: `MOCK-INCHI-OBJ:${molfile.slice(0,20).replace(/\n/g,'')}`, aux: 'MOCK-AUX' };
}

function InchiKeyFromInchi_sync(inchi) {
  return `MOCK-INCHIKEY:${inchi.slice(0,30)}`;
}

function computeInchiKey_helper(inchi) {
  return `MOCK-KEY-HELPER:${inchi.slice(0,30)}`;
}

module.exports = {
  // primary exports
  InchiFromMolfile: InchiFromMolfile_sync,
  InchiKeyFromInchi: InchiKeyFromInchi_sync,
  // alternate helpers
  computeInchiKey: computeInchiKey_helper,
  // default export shape too
  default: {
    getInchiFromMolfile: InchiFromMolfile_async,
    InchiKeyFromInchi: InchiKeyFromInchi_sync,
  }
};
