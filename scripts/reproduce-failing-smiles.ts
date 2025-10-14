import { parseSMILES, generateSMILES } from '../index';

const inp = 'O1C=C[C@H]([C@H]1O2)c3c2cc(OC)c4c3OC(=O)C5=C4CCC(=O)5';

function bondOrder(type: string) {
  switch (type) {
    case 'single': return 1;
    case 'double': return 2;
    case 'triple': return 3;
    case 'aromatic': return 1.5;
    default: return 0;
  }
}

function atomFingerprint(atom: any, bonds: any[], atoms: any[]) {
  const nbrs = bonds
    .filter(b => b.atom1 === atom.id || b.atom2 === atom.id)
    .map(b => {
      const otherId = b.atom1 === atom.id ? b.atom2 : b.atom1;
      const other = atoms.find(a => a.id === otherId);
      const sym = other ? other.symbol : 'X';
      return `${sym}:${b.type}`;
    })
    .sort();
  return `${atom.symbol}|arom=${!!atom.aromatic}|h=${atom.hydrogens||0}|chg=${atom.charge||0}|nbrs=${nbrs.join(',')}`;
}

function multisetFromArray(arr: string[]) {
  const m: Record<string, number> = {};
  for (const s of arr) m[s] = (m[s] || 0) + 1;
  return m;
}

const p = parseSMILES(inp);
console.log('parse errors:', p.errors || null);
const mol = p.molecules && p.molecules[0];
if (mol) {
  console.log('Original molecule atoms:');
  console.log(JSON.stringify(mol.atoms, null, 2));
  console.log('Original molecule bonds:');
  console.log(JSON.stringify(mol.bonds, null, 2));
}

const gen = generateSMILES(p.molecules);
console.log('generated:', gen);

const rt = parseSMILES(gen);
console.log('roundtrip errors:', rt.errors || null);
if (rt.errors) console.log('rt error messages:', rt.errors.map((e: any) => e.message));

if (rt.molecules && rt.molecules[0]) {
  const r = rt.molecules[0];
  console.log('Round-trip molecule atoms:');
  console.log(JSON.stringify(r.atoms, null, 2));
  console.log('Round-trip molecule bonds:');
  console.log(JSON.stringify(r.bonds, null, 2));

  const origAtoms = (mol && mol.atoms) || [];
  const origBonds = (mol && mol.bonds) || [];
  const rtAtoms = r.atoms || [];
  const rtBonds = r.bonds || [];

  const origFPs = origAtoms.map(a => ({ id: a.id, fp: atomFingerprint(a, origBonds, origAtoms) }));
  const rtFPs = rtAtoms.map(a => ({ id: a.id, fp: atomFingerprint(a, rtBonds, rtAtoms) }));

  console.log('Original atom fingerprints (id -> fp):');
  console.log(JSON.stringify(origFPs, null, 2));
  console.log('Roundtrip atom fingerprints (id -> fp):');
  console.log(JSON.stringify(rtFPs, null, 2));

  // Map original atoms to roundtrip atoms by fingerprint (greedy, first-match)
  const rtAvailable = new Set(rtFPs.map(x => x.id));
  const mapping: Record<number, number> = {};
  for (const o of origFPs) {
    const match = rtFPs.find(x => x.fp === o.fp && rtAvailable.has(x.id));
    if (match) {
      mapping[o.id] = match.id;
      rtAvailable.delete(match.id);
    } else {
      // fallback: try matching by symbol only
      const matchSym = rtFPs.find(x => x.fp.startsWith(o.fp.split('|')[0] + '|') && rtAvailable.has(x.id));
      if (matchSym) {
        mapping[o.id] = matchSym.id;
        rtAvailable.delete(matchSym.id);
      }
    }
  }

  console.log('Atom mapping (origId -> rtId):', mapping);

  // Compute bond-order sums per atom for original and mapped roundtrip
  const origSum: Record<number, number> = {};
  const rtSum: Record<number, number> = {};
  for (const a of origAtoms) origSum[a.id] = 0;
  for (const a of rtAtoms) rtSum[a.id] = 0;
  for (const b of origBonds) {
    origSum[b.atom1] = (origSum[b.atom1] || 0) + bondOrder(b.type);
    origSum[b.atom2] = (origSum[b.atom2] || 0) + bondOrder(b.type);
  }
  for (const b of rtBonds) {
    rtSum[b.atom1] = (rtSum[b.atom1] || 0) + bondOrder(b.type);
    rtSum[b.atom2] = (rtSum[b.atom2] || 0) + bondOrder(b.type);
  }

  const mismatches: string[] = [];
  for (const o of origAtoms) {
    const rid = mapping[o.id];
    const origVal = origSum[o.id];
    const mappedVal = rid !== undefined ? rtSum[rid] : null;
    if (mappedVal === null || mappedVal === undefined) {
      mismatches.push(`orig ${o.id} -> no mapped rt atom (origSum=${origVal})`);
    } else if (origVal !== mappedVal) {
      mismatches.push(`orig ${o.id} -> rt ${rid} : origSum=${origVal} rtSum=${mappedVal}`);
    }
  }

  console.log('Mapped atom bond-order mismatches:', mismatches);

  // For mismatched pairs, print bond lists
  for (const m of mismatches) {
    const mm = m.match(/orig (\d+) -> rt (\d+)/);
    if (!mm) continue;
    const oid = Number(mm[1]);
    const rid = Number(mm[2]);
    console.log('Original bonds for atom', oid, JSON.stringify(origBonds.filter(b => b.atom1 === oid || b.atom2 === oid), null, 2));
    console.log('Roundtrip bonds for mapped atom', rid, JSON.stringify(rtBonds.filter(b => b.atom1 === rid || b.atom2 === rid), null, 2));
  }

}
