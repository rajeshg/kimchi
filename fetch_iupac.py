import json
import time
import pubchempy as pcp
import os

# Configuration
SMILES_FILE = 'test/smiles/rdkit-comparison/smiles-10k.txt'
BATCH_SIZE = 15
OUTPUT_DIR = '.'
RATE_LIMIT_DELAY = 0.2  # seconds between requests

def fetch_iupac_batch(smiles_batch):
    """
    Fetch IUPAC names for a batch of SMILES from PubChem.
    """
    results = []
    for smiles in smiles_batch:
        try:
            compounds = pcp.get_compounds(smiles, 'smiles')
            if compounds:
                iupac = compounds[0].iupac_name or ''
            else:
                iupac = ''
            results.append({"smiles": smiles, "iupacName": iupac})
        except Exception as e:
            print(f"Error for {smiles}: {e}")
            results.append({"smiles": smiles, "iupacName": ""})
        time.sleep(RATE_LIMIT_DELAY)  # rate limit per request
    return results

def main():
    # Read SMILES from file
    smiles = []
    try:
        with open(SMILES_FILE, 'r') as f:
            for line in f:
                line = line.strip()
                if line:
                    smiles.append(line)
    except FileNotFoundError:
        print(f"Error: {SMILES_FILE} not found.")
        return
    
    # Take first 300 SMILES
    smiles = smiles[:300]
    print(f"Processing {len(smiles)} SMILES strings.")
    
    # Process in batches
    for i in range(0, len(smiles), BATCH_SIZE):
        batch = smiles[i:i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        
        print(f"Fetching batch {batch_num}...")
        results = fetch_iupac_batch(batch)
        
        # Write to JSON file
        filename = f"batch_{batch_num}.json"
        if os.path.exists(filename):
            print(f"Skipping {filename}")
            continue
        with open(filename, 'w') as f:
            json.dump(results, f, indent=2)
        
        print(f"Written {filename}")
        
        # Rate limiting already in fetch

    # Merge all batch files into one
    all_results = []
    num_batches = (len(smiles) + BATCH_SIZE - 1) // BATCH_SIZE
    for i in range(1, num_batches + 1):
        filename = f"batch_{i}.json"
        if os.path.exists(filename):
            with open(filename, 'r') as f:
                batch_data = json.load(f)
                all_results.extend(batch_data)
    
    with open("all_results.json", 'w') as f:
        json.dump(all_results, f, indent=2)
    
    print("Merged all results to all_results.json")

if __name__ == "__main__":
    main()