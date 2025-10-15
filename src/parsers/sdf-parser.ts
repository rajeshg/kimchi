import type { Molecule, ParseError } from 'types';
import { parseMolfile, type MolfileData } from './molfile-parser';

export interface SDFRecord {
  molecule: Molecule | null;
  molfile: MolfileData | null;
  properties: Record<string, string>;
  errors: ParseError[];
}

export interface SDFParseResult {
  records: SDFRecord[];
  errors: ParseError[];
}

export function parseSDF(input: string): SDFParseResult {
  const globalErrors: ParseError[] = [];
  const records: SDFRecord[] = [];

  const recordTexts = input.split(/\$\$\$\$/);

  for (let i = 0; i < recordTexts.length; i++) {
    let recordText = recordTexts[i];
    if (!recordText || !recordText.trim()) continue;

    if (i > 0) {
      recordText = recordText.replace(/^\n+/, '');
    }

    const record = parseSDFRecord(recordText, i);
    records.push(record);
  }

  return {
    records,
    errors: globalErrors,
  };
}

function parseSDFRecord(recordText: string, recordIndex: number): SDFRecord {
  const lines = recordText.split(/\r?\n/);
  
  let molBlockEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim() === 'M  END') {
      molBlockEnd = i;
      break;
    }
  }

  if (molBlockEnd === -1) {
    return {
      molecule: null,
      molfile: null,
      properties: {},
      errors: [{ message: `Record ${recordIndex}: No M  END found in MOL block`, position: recordIndex }],
    };
  }

  const molBlockLines = lines.slice(0, molBlockEnd + 1);
  const molBlockText = molBlockLines.join('\n');
  const molResult = parseMolfile(molBlockText);

  const propertyLines = lines.slice(molBlockEnd + 1);
  const properties = parsePropertyBlock(propertyLines);

  return {
    molecule: molResult.molecule,
    molfile: molResult.molfile,
    properties,
    errors: molResult.errors,
  };
}

function parsePropertyBlock(lines: string[]): Record<string, string> {
  const properties: Record<string, string> = {};
  let currentKey: string | null = null;
  let valueLines: string[] = [];

  const saveProperty = () => {
    if (currentKey === null) return;
    
    while (valueLines.length > 0 && valueLines[valueLines.length - 1]!.trim() === '') {
      valueLines.pop();
    }
    
    if (valueLines.length === 0) {
      properties[currentKey] = '';
    } else if (valueLines.length === 1) {
      properties[currentKey] = valueLines[0]!.trim();
    } else {
      properties[currentKey] = valueLines.join('\n');
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('>')) {
      saveProperty();

      const match = trimmed.match(/^>\s*<([^>]*)>/);
      if (match && match[1] !== undefined) {
        currentKey = match[1].trim();
        valueLines = [];
      } else {
        currentKey = null;
      }
    } else if (currentKey !== null) {
      valueLines.push(line);
    }
  }

  saveProperty();

  return properties;
}
