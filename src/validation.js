import { requireThat as check, unb64, utf8 } from './encoding.js';
export function shape(v, required, optional = []) {
  check(v && typeof v === 'object' && !Array.isArray(v), 'invalid_object');
  check(required.every((k) => Object.hasOwn(v, k)) && Object.keys(v).every((k) => required.includes(k) || optional.includes(k)), 'invalid_fields');
}
export function string(v, max = 128, pattern) {
  check(typeof v === 'string' && v.length > 0 && utf8(v).length <= max && (!pattern || pattern.test(v)), 'invalid_string');
}
export function id(v) { string(v, 64, /^[a-z0-9][a-z0-9-]*$/); }
export function kid(v) { string(v, 64, /^[A-Za-z0-9_-]+$/); }
export function timestamp(v) { check(Number.isSafeInteger(v) && v >= 0, 'invalid_timestamp'); }
export function network(v) { check(v === 'mainnet' || v === 'testnet', 'invalid_network'); }
export function origin(v) {
  string(v, 253, /^https:\/\/[a-z0-9.-]+$/);
  const url = new URL(v);
  check(url.origin === v && url.hostname.includes('.') && !/^[0-9.]+$/.test(url.hostname), 'invalid_origin');
  check(url.hostname.split('.').every((part) => part.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)), 'invalid_origin');
}
function list(v, min, max) { check(Array.isArray(v) && v.length >= min && v.length <= max, 'invalid_list'); }
function unique(v) { check(new Set(v).size === v.length, 'duplicate_entry'); }
export function merchant(v) {
  shape(v, ['version', 'id', 'name', 'origins', 'status', 'paymentKeys']);
  check(v.version === 1, 'unsupported_version'); id(v.id); string(v.name, 80);
  check(!/[\p{Cc}\p{Cf}]/u.test(v.name), 'invalid_name');
  list(v.origins, 1, 20); v.origins.forEach(origin); unique(v.origins);
  check(['active', 'suspended'].includes(v.status), 'invalid_status');
  list(v.paymentKeys, 1, 20);
  for (const k of v.paymentKeys) {
    shape(k, ['kid', 'algorithm', 'publicKey', 'networks', 'notBefore', 'expiresAt']);
    kid(k.kid); check(k.algorithm === 'Ed25519', 'unsupported_algorithm'); unb64(k.publicKey, 32);
    list(k.networks, 1, 2); k.networks.forEach(network); unique(k.networks);
    timestamp(k.notBefore); timestamp(k.expiresAt); check(k.notBefore < k.expiresAt, 'invalid_key_lifetime');
  }
  unique(v.paymentKeys.map((k) => k.kid));
}
export function registry(v) {
  shape(v, ['version', 'registryId', 'sequence', 'issuedAt', 'expiresAt', 'sourceCommit', 'merchants', 'revocations']);
  check(v.version === 1, 'unsupported_version'); id(v.registryId);
  check(Number.isSafeInteger(v.sequence) && v.sequence > 0, 'invalid_sequence');
  lifetime(v, 86400); string(v.sourceCommit, 64, /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
  list(v.merchants, 0, 10000); v.merchants.forEach(merchant); unique(v.merchants.map((m) => m.id));
  unique(v.merchants.flatMap((m) => m.origins));
  list(v.revocations, 0, 100000);
  for (const r of v.revocations) {
    shape(r, ['merchantId', 'kid', 'revokedAt', 'reason']); id(r.merchantId); kid(r.kid); timestamp(r.revokedAt);
    check(r.revokedAt <= v.issuedAt, 'future_revocation');
    check(['compromised', 'retired', 'ownership-change', 'policy'].includes(r.reason), 'invalid_reason');
  }
  unique(v.revocations.map((r) => r.merchantId + '/' + r.kid));
}
export function lifetime(v, max) {
  timestamp(v.issuedAt); timestamp(v.expiresAt);
  check(v.issuedAt < v.expiresAt && v.expiresAt - v.issuedAt <= max, 'invalid_lifetime');
}
export function fresh(v, now) {
  timestamp(now); check(v.issuedAt <= now + 60 && now < v.expiresAt, 'expired_or_future');
}
export function invoice(v) {
  shape(v, ['version', 'registryId', 'merchantId', 'kid', 'origin', 'network', 'invoiceId', 'issuedAt', 'expiresAt', 'paymentUri'], ['challenge']);
  check(v.version === 1, 'unsupported_version'); id(v.registryId); id(v.merchantId); kid(v.kid); origin(v.origin); network(v.network);
  string(v.invoiceId, 128, /^[A-Za-z0-9_-]+$/); lifetime(v, 900); string(v.paymentUri, 16384, /^zcash:/);
  if (v.challenge !== undefined) unb64(v.challenge, 32);
}
export function proof(v) {
  shape(v, ['version', 'registryId', 'merchantId', 'kid', 'origin', 'recordSha256', 'challenge', 'issuedAt', 'expiresAt']);
  check(v.version === 1, 'unsupported_version'); id(v.registryId); id(v.merchantId); kid(v.kid); origin(v.origin);
  string(v.recordSha256, 64, /^[a-f0-9]{64}$/); unb64(v.challenge, 32); lifetime(v, 86400);
}
