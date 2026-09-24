import { readdir, readFile } from 'node:fs/promises';
import { strictJSON, validateMerchantRecord } from '../src/index.js';
const dir = new URL('../merchants/', import.meta.url);
const records = [];
for (const file of await readdir(dir)) {
  if (file.startsWith('.')) continue;
  if (!file.endsWith('.json')) throw new Error('Unexpected merchant file: ' + file);
  const record = strictJSON(await readFile(new URL(file, dir), 'utf8'));
  validateMerchantRecord(record);
  if (file !== record.id + '.json') throw new Error('Merchant filename must equal its ID');
  records.push(record);
}
const origins = records.flatMap((r) => r.origins);
if (new Set(origins).size !== origins.length) throw new Error('Duplicate registered origin');
console.log(`Validated ${records.length} merchant records. Domain proof and release approval are separate.`);
const { validateRegistryPayload } = await import('../src/index.js');
const revocations = strictJSON(await readFile(new URL('../revocations.json', import.meta.url), 'utf8'));
const now = Math.floor(Date.now() / 1000);
validateRegistryPayload({version:1,registryId:'schema-check',sequence:1,issuedAt:now,expiresAt:now+86400,sourceCommit:'0'.repeat(40),merchants:records,revocations});
console.log(`Validated ${revocations.length} revocation tombstones.`);
