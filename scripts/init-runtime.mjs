import { mkdirSync, chmodSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
if (Number(process.versions.node.split('.')[0]) < 22) throw Error('Node.js 22+ is required');
const root = dirname(dirname(fileURLToPath(import.meta.url)));
for (const name of ['runtime', 'runtime/accounts', 'runtime/data', 'runtime/host-data']) {
  const path = join(root, name); mkdirSync(path, { recursive: true, mode: 0o700 }); chmodSync(path, 0o700);
}
const path = join(root, 'runtime/data/api-key');
try { writeFileSync(path, 'wb-local-' + randomBytes(32).toString('hex') + '\n', { flag: 'wx', mode: 0o600 }); }
catch (error) { if (error.code !== 'EEXIST') throw error; }
chmodSync(path, 0o600);
console.log('Runtime initialized. API key is in runtime/data/api-key (not printed).');
