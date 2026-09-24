// Operator tooling, deliberately separate from the portable invoice verifier.
import { createHash } from 'node:crypto';
import { validateMerchantRecord, validateRegistryPayload, verifyRegistrationProof } from '../src/index.js';
import { strictJSON } from '../src/encoding.js';
import { decodeJws, verifyJws } from '../src/jws.js';
import { proof as validateProof } from '../src/validation.js';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const require = (condition, message) => { if (!condition) throw new Error(message); };
const commit = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

/** Trusted challenge envelope is created by the operator, never supplied as PR authority. */
export function challengeEnvelope(proof, {repository, sourceCommit}) {
 validateProof(proof);
 require(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) && commit(sourceCommit), 'Invalid repository or record commit');
 return {version: 1, repository, sourceCommit, proof};
}
export async function verifyEnrollment({recordBytes, compact, trustedChallenge, repository, sourceCommit, resolveTxt, now}) {
 require(trustedChallenge?.version === 1 && trustedChallenge.repository === repository && trustedChallenge.sourceCommit === sourceCommit, 'Trusted challenge source mismatch');
 const record = strictJSON(new TextDecoder('utf-8', {fatal: true}).decode(recordBytes));
 const proof = await verifyRegistrationProof(compact, {record, recordBytes, expected: trustedChallenge.proof, now});
 const wanted = `v=1; registry=${proof.registryId}; merchant=${proof.merchantId}; record=${proof.recordSha256}; challenge=${proof.challenge}`;
 const dnsName = '_zcash-merchant.' + new URL(proof.origin).hostname;
 const records = await resolveTxt(dnsName);
 require(records.some(chunks => chunks.join('') === wanted), 'Domain TXT proof mismatch');
 return {merchantId: record.id, recordSha256: hash(recordBytes), kid: proof.kid, origin: proof.origin, verifiedAt: now, expiresAt: proof.expiresAt, sourceCommit, repository, dnsName, dnsValue: wanted};
}

/** Retiring a key needs its tombstone; accepted key IDs are never reused or rewritten. */
export function validateTransition(previous, next) {
 validateRegistryPayload(next);
 if (!previous) return;
 validateRegistryPayload(previous);
 require(next.registryId === previous.registryId && next.sequence === previous.sequence + 1 && next.issuedAt >= previous.issuedAt, 'Registry sequence or time regression');
 for (const revocation of previous.revocations) require(next.revocations.some(r => equal(r, revocation)), 'Revocations are append-only');
 for (const old of previous.merchants) {
  const replacement = next.merchants.find(m => m.id === old.id);
  require(replacement, 'Keep removed merchants as suspended tombstones');
  for (const key of old.paymentKeys) {
   const newer = replacement.paymentKeys.find(k => k.kid === key.kid);
   require(!newer || equal(key, newer), 'An existing key ID cannot change; rotate to a new key ID');
   if (!newer) require(next.revocations.some(r => r.merchantId === old.id && r.kid === key.kid), 'Removed key needs revocation');
  }
 }
 // A previously retired key ID cannot return, even under a different public key.
 for (const revoked of previous.revocations) {
  const old = previous.merchants.find(m => m.id === revoked.merchantId)?.paymentKeys.find(k => k.kid === revoked.kid);
  const nextKey = next.merchants.find(m => m.id === revoked.merchantId)?.paymentKeys.find(k => k.kid === revoked.kid);
  require(!nextKey || (old && equal(old, nextKey)), 'Revoked key ID cannot be reintroduced');
 }
}

/** Old-key approval signs the replacement file hash using the existing registration wire format. */
export async function verifyRotationAuthorization({previous, recordBytes, compact, expected, revokedKids = [], now}) {
 validateMerchantRecord(previous);
 const replacement = strictJSON(new TextDecoder('utf-8', {fatal: true}).decode(recordBytes)); validateMerchantRecord(replacement);
 const decoded = decodeJws(compact, 'zcash-merchant-registration+jws');
 const key = previous.paymentKeys.find(k => k.kid === decoded.header.kid);
 require(key && !revokedKids.includes(key.kid) && key.notBefore <= now && now < key.expiresAt, 'Valid previous key required');
 const value = await verifyJws(decoded, key.publicKey); validateProof(value);
 require(value.issuedAt <= now && now < value.expiresAt && value.expiresAt <= key.expiresAt, 'Rotation approval expired');
 require(replacement.id === previous.id && value.merchantId === previous.id && value.kid === key.kid && value.recordSha256 === hash(recordBytes) && previous.origins.includes(value.origin), 'Rotation approval does not match replacement');
 require(equal(value, expected), 'Rotation approval differs from trusted challenge');
 return value;
}

/** Two distinct approved maintainers, fetched by the operator from GitHub, not from a PR file. */
export function validateReviewEvidence({pull, reviews, repository, sourceCommit, maintainers}) {
 require(commit(sourceCommit) && pull?.head?.sha === sourceCommit && pull.base?.repo?.full_name === repository && pull.base.ref === 'main' && pull.state === 'open' && !pull.draft, 'PR source changed or is not eligible');
 const latest = new Map();
 for (const review of [...reviews].sort((a,b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at))) {
  // Comments do not erase an approval/change request; a dismissed review does.
  if (['APPROVED','CHANGES_REQUESTED','DISMISSED'].includes(review.state)) latest.set(review.user?.login, review);
 }
 require(![...latest.values()].some(r => maintainers.includes(r.user?.login) && r.state === 'CHANGES_REQUESTED'), 'Maintainer requested changes');
 const approved = [...latest.values()].filter(r => r.state === 'APPROVED' && r.commit_id === sourceCommit && maintainers.includes(r.user?.login) && r.user?.login !== pull.user?.login).map(r => r.user.login);
 require(new Set(approved).size >= 2, 'Two current-head maintainer approvals required');
 return [...new Set(approved)].sort();
}
