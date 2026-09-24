// Run from trusted main, store the output outside PR-controlled files.
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { strictJSON, validateMerchantRecord } from '../src/index.js';
import { challengeEnvelope, hash } from './lifecycle.mjs';
const [path, registryId, origin, kid, repository, sourceCommit] = process.argv.slice(2);
if (!path) throw new Error('Usage: node scripts/create-challenge.mjs <record> <registry-id> <origin> <kid> <owner/repo> <record-commit>');
const bytes = await readFile(path); const record = strictJSON(bytes.toString('utf8')); validateMerchantRecord(record);
if (!record.origins.includes(origin) || !record.paymentKeys.some(k => k.kid === kid)) throw new Error('Origin/key not in record');
const issuedAt = Math.floor(Date.now() / 1000);
console.log(JSON.stringify(challengeEnvelope({version:1,registryId,merchantId:record.id,kid,origin,recordSha256:hash(bytes),challenge:randomBytes(32).toString('base64url'),issuedAt,expiresAt:issuedAt+86400},{repository,sourceCommit}),null,2));
