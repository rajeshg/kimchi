import fs from "fs/promises";

const datasetPath =
  "test/unit/iupac-engine/smiles-to-iupac-realistic-dataset.json";

async function fetchIupacForSmiles(smiles) {
  const encoded = encodeURIComponent(smiles);
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encoded}/property/IUPACName/JSON`;
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${txt}` };
    }
    const j = await res.json();
    const props = j?.PropertyTable?.Properties?.[0];
    if (props && props.IUPACName) {
      return { ok: true, name: props.IUPACName };
    }
    return { ok: false, error: `No IUPACName in response` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function main() {
  console.log("Reading dataset:", datasetPath);
  const raw = await fs.readFile(datasetPath, "utf8");
  const data = JSON.parse(raw);

  // Backup
  await fs.writeFile(datasetPath + ".bak", raw, "utf8");

  let updated = 0;
  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    const smiles = entry.smiles;
    process.stdout.write(`Fetching ${i + 1}/${data.length}: ${smiles} ... `);
    const res = await fetchIupacForSmiles(smiles);
    if (res.ok) {
      const newName = res.name;
      if (entry.iupac !== newName) {
        entry.iupac = newName;
        updated++;
        console.log("updated");
      } else {
        console.log("same");
      }
    } else {
      console.log(`failed (${res.error})`);
    }

    // polite pause
    await new Promise((r) => setTimeout(r, 150));
  }

  await fs.writeFile(datasetPath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(
    `Done. Updated ${updated} entries. Backup saved to ${datasetPath}.bak`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
