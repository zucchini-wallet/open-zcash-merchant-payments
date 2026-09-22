import { requireThat as check, strictJSON, text, freeze, digest } from './encoding.js';
import { registry, invoice, fresh, timestamp, proof, merchant } from './validation.js';
import { decodeJws, verifyJws, payloadDigest } from './jws.js';
import { parsePaymentUri } from './zip321.js';
export { ProtocolError, strictJSON } from './encoding.js';
export { parsePaymentUri } from './zip321.js';
export { merchant as validateMerchantRecord, registry as validateRegistryPayload } from './validation.js';
const registries = new WeakSet();
const nowSeconds = () => Math.floor(Date.now() / 1000);

// Call within the host's durable storage transaction. Keeping only RAM state is
// suitable for a demo, not production anti-rollback protection.
export function assertCheckpoint(previous, next) {
  check(Number.isSafeInteger(next.sequence) && next.sequence > 0 && typeof next.digest === 'string', 'invalid_checkpoint');
  if (previous) {
    check(previous.registryId === next.registryId, 'registry_mismatch');
    check(next.sequence >= previous.sequence, 'registry_rollback');
    check(next.sequence !== previous.sequence || next.digest === previous.digest, 'registry_equivocation');
  }
}
export async function verifyRegistry(compact, { trust, state, now = nowSeconds() }) {
  timestamp(now); check(typeof state?.accept === 'function', 'durable_state_required');
  check(Number.isSafeInteger(trust.minimumSequence) && trust.minimumSequence > 0, 'invalid_trust');
  check(Array.isArray(trust.roots) && new Set(trust.roots.map((r) => r.kid)).size === trust.roots.length, 'invalid_trust');
  const decoded = decodeJws(compact, 'zcash-merchant-registry+jws', 4 * 1024 * 1024);
  const root = trust.roots.find((r) => r.kid === decoded.header.kid); check(root, 'unknown_registry_key');
  const payload = await verifyJws(decoded, root.publicKey); registry(payload); fresh(payload, now);
  check(payload.registryId === trust.registryId, 'registry_mismatch');
  check(payload.sequence >= trust.minimumSequence, 'registry_rollback');
  const checkpoint = freeze({ registryId: payload.registryId, sequence: payload.sequence, digest: await payloadDigest(decoded) });
  await state.accept(checkpoint); // Host atomically compares AND persists before returning.
  const result = freeze({ ...payload, checkpoint }); registries.add(result); return result;
}
export async function verifyInvoice(compact, options) {
  const { registry: snapshot, network, context, validateAddress, now = nowSeconds() } = options;
  check(registries.has(snapshot), 'verified_registry_required'); fresh(snapshot, now);
  const decoded = decodeJws(compact, 'zcash-merchant-invoice+jws');
  const untrusted = strictJSON(text(decoded.payloadBytes)); invoice(untrusted);
  check(decoded.header.kid === untrusted.kid, 'key_id_mismatch');
  check(untrusted.registryId === snapshot.registryId, 'registry_mismatch');
  check(untrusted.network === network, 'network_mismatch');
  const record = snapshot.merchants.find((m) => m.id === untrusted.merchantId);
  check(record && record.status === 'active', 'merchant_unavailable');
  check(record.origins.includes(untrusted.origin), 'origin_not_registered');
  const key = record.paymentKeys.find((k) => k.kid === untrusted.kid); check(key, 'unknown_merchant_key');
  check(key.networks.includes(network) && now >= key.notBefore && now < key.expiresAt &&
    untrusted.issuedAt >= key.notBefore && untrusted.expiresAt <= key.expiresAt, 'key_not_valid');
  check(!snapshot.revocations.some((r) => r.merchantId === record.id && r.kid === key.kid), 'key_revoked');
  const payload = await verifyJws(decoded, key.publicKey); fresh(payload, now);
  check(context && ['browser', 'import'].includes(context.kind), 'invalid_context');
  if (context.kind === 'browser') {
    check(payload.origin === context.origin, 'browser_origin_mismatch');
    check(typeof context.challenge === 'string' && payload.challenge === context.challenge, 'challenge_mismatch');
  } else {
    // Session-bound requests may not be replayed through the import path.
    check(payload.challenge === undefined, 'session_invoice_requires_browser');
  }
  const payment = await parsePaymentUri(payload.paymentUri, network, validateAddress);
  // SDK verifies identity and terms. Wallet still owns atomic replay reservations,
  // transaction construction, exact fee review, approvals and broadcast recovery.
  return freeze({ invoice: payload, payment, merchantName: record.name,
    verification: context.kind === 'browser' ? 'issuer-and-browser-origin' : 'issuer-only',
    digest: await payloadDigest(decoded),
    replayKey: `${payload.registryId}/${payload.merchantId}/${payload.invoiceId}`,
    validUntil: Math.min(payload.expiresAt, snapshot.expiresAt, key.expiresAt) });
}
export async function verifyRegistrationProof(compact, { record, recordBytes, expected, now = nowSeconds() }) {
  merchant(record);
  // Hash the exact PR file bytes. The parsed record must be the same file.
  const parsed = strictJSON(text(recordBytes));
  check(JSON.stringify(parsed) === JSON.stringify(record), 'record_bytes_mismatch');
  const decoded = decodeJws(compact, 'zcash-merchant-registration+jws');
  const key = record.paymentKeys.find((k) => k.kid === decoded.header.kid); check(key, 'unknown_merchant_key');
  const payload = await verifyJws(decoded, key.publicKey); proof(payload); fresh(payload, now);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', recordBytes)), b => b.toString(16).padStart(2, '0')).join('');
  check(payload.recordSha256 === hash && payload.merchantId === record.id && payload.kid === key.kid, 'proof_record_mismatch');
  check(record.origins.includes(payload.origin), 'origin_not_registered');
  for (const field of ['registryId', 'merchantId', 'kid', 'origin', 'recordSha256', 'challenge', 'issuedAt', 'expiresAt']) {
    check(payload[field] === expected[field], 'proof_challenge_mismatch');
  }
  return freeze(payload); // DNS control and maintainer authorization are separate.
}
