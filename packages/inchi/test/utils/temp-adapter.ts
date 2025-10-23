import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

export async function createTempCjsAdapter(content: string, prefix = 'inchi-adapter-') {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const filePath = path.join(tmpDir, 'index.cjs');
  await fs.writeFile(filePath, content, 'utf8');
  return { filePath, cleanup: async () => { try { await fs.rm(tmpDir, { recursive: true, force: true }); } catch (e) {} } };
}
