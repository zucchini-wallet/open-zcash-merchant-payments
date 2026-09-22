// Run only with a maintainer-issued challenge file from a trusted location.
// Never use a PR-provided challenge as authority or grant this job release secrets.
import { readFile } from 'node:fs/promises';
import { resolveTxt } from 'node:dns/promises';
import { strictJSON, verifyRegistrationProof } from '../src/index.js';
const [recordPath, proofPath, trustedChallengePath] = process.argv.slice(2);
if (!recordPath || !proofPath || !trustedChallengePath) throw new Error('Usage: node scripts/verify-domain.mjs <merchant.json> <proof.jws> <trusted-challenge.json>');
const recordBytes = new Uint8Array(await readFile(recordPath));
const record = strictJSON(new TextDecoder('utf-8', { fatal: true }).decode(recordBytes));
const expected = strictJSON(await readFile(trustedChallengePath, 'utf8'));
const proof = await verifyRegistrationProof((await readFile(proofPath, 'utf8')).trim(), { record, recordBytes, expected });
const hostname = new URL(proof.origin).hostname;
const wanted = `v=1; registry=${proof.registryId}; merchant=${proof.merchantId}; record=${proof.recordSha256}; challenge=${proof.challenge}`;
const records = await resolveTxt('_zcash-merchant.' + hostname);
if (!records.some((chunks) => chunks.join('') === wanted)) throw new Error('Domain TXT proof does not match the trusted challenge');
console.log('Domain control and key possession verified. Maintainer approval and protected release are still required.');
