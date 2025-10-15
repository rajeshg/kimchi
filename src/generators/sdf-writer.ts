import type { Molecule } from 'types';
import { generateMolfile, type MolGeneratorOptions } from './mol-generator';

export interface SDFWriterOptions extends MolGeneratorOptions {
  v3000?: boolean;
}

export interface SDFRecord {
  molecule: Molecule;
  properties?: Record<string, string | number | boolean>;
}

export interface SDFWriterResult {
  sdf: string;
  errors: string[];
}

export function writeSDF(
  records: SDFRecord | SDFRecord[],
  options?: SDFWriterOptions
): SDFWriterResult {
  const recordArray = Array.isArray(records) ? records : [records];
  const errors: string[] = [];
  const sdfLines: string[] = [];

  for (let i = 0; i < recordArray.length; i++) {
    const record = recordArray[i]!;
    
    try {
      const molblock = generateMolfile(record.molecule, options);
      sdfLines.push(molblock.trimEnd());
      
      if (record.properties) {
        const propertyBlock = formatPropertyBlock(record.properties);
        sdfLines.push(propertyBlock);
      }
      
      sdfLines.push('$$$$');
    } catch (error) {
      errors.push(`Record ${i}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    sdf: sdfLines.join('\n') + '\n',
    errors,
  };
}

function formatPropertyBlock(properties: Record<string, string | number | boolean>): string {
  const lines: string[] = [];
  
  for (const [key, value] of Object.entries(properties)) {
    lines.push(`>  <${key}>`);
    lines.push(String(value));
    lines.push('');
  }
  
  return lines.join('\n');
}
