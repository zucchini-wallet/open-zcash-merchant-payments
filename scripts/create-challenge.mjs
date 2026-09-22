// Maintainer-only helper. Keep output outside PR-controlled files until issued.
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { strictJSON, validateMerchantRecord } from '../src/index.js';
const [path, registryId, origin, kid] = process.argv.slice(2);
if (!path || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(registryId ?? '')) throw new Error('Usage: node scripts/create-challenge.mjs <record> <registry-id> <origin> <kid>');
const bytes = await readFile(path); const record = strictJSON(bytes.toString('utf8'));
validateMerchantRecord(record);
if (!record.origins.includes(origin) || !record.paymentKeys.some((k) => k.kid === kid)) throw new Error('Origin/key not in record');
const issuedAt = Math.floor(Date.now() / 1000);
console.log(JSON.stringify({ version: 1, registryId, merchantId: record.id, kid, origin,
 recordSha256: createHash('sha256').update(bytes).digest('hex'), challenge: randomBytes(32).toString('base64url'),
 issuedAt, expiresAt: issuedAt + 86400 }, null, 2));
