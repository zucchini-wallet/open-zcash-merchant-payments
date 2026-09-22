import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyInvoice, verifyRegistry, verifyRegistrationProof, strictJSON, parsePaymentUri, validateMerchantRecord } from '../src/index.js';
import { signInvoice, signRegistrationProof } from '../src/server.js';
import { signJws } from '../src/jws.js';
import * as f from './fixtures.mjs';
const options = async (extra = {}) => ({ registry: await f.snapshot(), network: 'testnet', context: { kind: 'import' }, validateAddress: f.validateAddress, now: f.now, ...extra });
const fails = (code) => (error) => { assert.equal(error.code, code); return true; };

test('portable invoice verifies issuer and immutable exact zatoshis/memo', async () => {
 const result = await verifyInvoice(await f.signedInvoice(), await options());
 assert.equal(result.payment.amountZatoshis, '1000000'); assert.equal(result.payment.memoBase64url, 'aGVsbG8');
 assert.equal(result.verification, 'issuer-only'); assert.ok(Object.isFrozen(result.invoice));
});
test('browser challenge and origin bind the request', async () => {
 const challenge = Buffer.alloc(32, 9).toString('base64url');
 const jws = await f.signedInvoice({ ...f.invoice, challenge });
 const context = { kind: 'browser', origin: f.invoice.origin, challenge };
 assert.equal((await verifyInvoice(jws, await options({ context }))).verification, 'issuer-and-browser-origin');
 await assert.rejects(verifyInvoice(jws, await options({ context: { ...context, origin: 'https://evil.example' } })), fails('browser_origin_mismatch'));
 await assert.rejects(verifyInvoice(jws, await options({ context: { ...context, challenge: 'wrong' } })), fails('challenge_mismatch'));
 await assert.rejects(verifyInvoice(jws, await options()), fails('session_invoice_requires_browser'));
});
for (const [name, change] of Object.entries({ amount: { paymentUri: f.invoice.paymentUri.replace('0.01', '1.00') }, memo: { paymentUri: f.invoice.paymentUri.replace('aGVsbG8', 'dGFtcGVyZWQ') }, recipient: { paymentUri: f.invoice.paymentUri.replace(f.address, 'ATTACKER') }, invoice: { invoiceId: 'other' } })) {
 test(`reject tampered ${name}`, async () => {
  const parts = (await f.signedInvoice()).split('.'); parts[1] = Buffer.from(JSON.stringify({ ...f.invoice, ...change })).toString('base64url');
  await assert.rejects(verifyInvoice(parts.join('.'), await options()), fails('invalid_signature'));
 });
}
test('reject wrong signature key and non-verified registry objects', async () => {
 const jws = await signInvoice(f.invoice, { sign: f.root.sign, validateAddress: f.validateAddress });
 await assert.rejects(verifyInvoice(jws, await options()), fails('invalid_signature'));
 await assert.rejects(verifyInvoice(await f.signedInvoice(), await options({ registry: f.registryPayload })), fails('verified_registry_required'));
});
test('key and registry expiry, suspension, revocation, network and origin', async () => {
 const jws = await f.signedInvoice();
 await assert.rejects(verifyInvoice(jws, await options({ now: f.now + 600 })), fails('expired_or_future'));
 await assert.rejects(verifyInvoice(jws, await options({ now: f.now + 3600 })), fails('expired_or_future'));
 await assert.rejects(verifyInvoice(jws, await options({ network: 'mainnet' })), fails('network_mismatch'));
 const suspended = await f.snapshot({ ...f.registryPayload, merchants: [{ ...f.record, status: 'suspended' }] });
 await assert.rejects(verifyInvoice(jws, await options({ registry: suspended })), fails('merchant_unavailable'));
 const revoked = await f.snapshot({ ...f.registryPayload, revocations: [{ merchantId: 'example', kid: 'merchant-1', revokedAt: f.now, reason: 'compromised' }] });
 await assert.rejects(verifyInvoice(jws, await options({ registry: revoked })), fails('key_revoked'));
 const shortKey = await f.snapshot({ ...f.registryPayload, merchants: [{ ...f.record, paymentKeys: [{ ...f.record.paymentKeys[0], expiresAt: f.now + 300 }] }] });
 await assert.rejects(verifyInvoice(jws, await options({ registry: shortKey })), fails('key_not_valid'));
 const unregistered = await f.signedInvoice({ ...f.invoice, origin: 'https://other.example' });
 await assert.rejects(verifyInvoice(unregistered, await options()), fails('origin_not_registered'));
});
test('registry state rejects rollback, equivocation and separate registry/environment', async () => {
 const state = f.memoryState(); await f.snapshot({ ...f.registryPayload, sequence: 2 }, state);
 await assert.rejects(f.snapshot(f.registryPayload, state), fails('registry_rollback'));
 await assert.rejects(f.snapshot({ ...f.registryPayload, sequence: 2, expiresAt: f.now + 1000 }, state), fails('registry_equivocation'));
 await assert.rejects(verifyRegistry(await f.signedRegistry(), { trust: { ...f.trust, registryId: 'other' }, state: f.memoryState(), now: f.now }), fails('registry_mismatch'));
 await assert.rejects(verifyRegistry(await f.signedRegistry(), { trust: f.trust, now: f.now }), fails('durable_state_required'));
});
test('registry trust roots, unknown key and snapshot freshness', async () => {
 const compact = await f.signedRegistry();
 await assert.rejects(verifyRegistry(compact, { trust: { ...f.trust, roots: [] }, state: f.memoryState(), now: f.now }), fails('unknown_registry_key'));
 await assert.rejects(verifyRegistry(compact, { trust: { ...f.trust, roots: [{ kid: 'release-1', publicKey: f.merchantKey.publicKey }] }, state: f.memoryState(), now: f.now }), fails('invalid_signature'));
 await assert.rejects(verifyRegistry(compact, { trust: f.trust, state: f.memoryState(), now: f.now + 3600 }), fails('expired_or_future'));
});
test('JWS rejects algorithm/purpose confusion, duplicate keys, extras and encodings', async () => {
 const original = await f.signedInvoice();
 for (const header of [
  { alg: 'none', typ: 'zcash-merchant-invoice+jws', kid: 'merchant-1' },
  { alg: 'Ed25519', typ: 'zcash-merchant-registry+jws', kid: 'merchant-1' },
  { alg: 'Ed25519', typ: 'zcash-merchant-invoice+jws', kid: 'merchant-1', jku: 'https://evil.example' },
 ]) {
  const parts = original.split('.'); parts[0] = Buffer.from(JSON.stringify(header)).toString('base64url');
  await assert.rejects(verifyInvoice(parts.join('.'), await options()));
 }
 const parts = original.split('.'); parts[0] += '=';
 await assert.rejects(verifyInvoice(parts.join('.'), await options()), fails('invalid_base64url'));
 const dup = original.split('.'); dup[1] = Buffer.from('{"version":1,"version":2}').toString('base64url');
 await assert.rejects(verifyInvoice(dup.join('.'), await options()), fails('duplicate_json_key'));
 const extra = await signJws({ ...f.invoice, arbitrary: true }, 'zcash-merchant-invoice+jws', 'merchant-1', f.merchantKey.sign);
 await assert.rejects(verifyInvoice(extra, await options()), fails('invalid_fields'));
});
test('strict JSON rejects nested/escaped duplicates, trailing commas, invalid surrogates and depth', () => {
 for (const input of ['{"a":1,"\\u0061":2}', '{"a":{"b":1,"b":2}}', '{"a":1,}', '[1,]', '1x', '"\\ud800"', '['.repeat(34) + '0' + ']'.repeat(34)]) assert.throws(() => strictJSON(input));
 assert.equal(strictJSON('{"__proto__":1}').__proto__, 1);
 assert.equal(Object.getPrototypeOf(strictJSON('{"__proto__":1}')), null);
});
test('ZIP321 profile fails closed on unsupported and ambiguous payment features', async () => {
 for (const suffix of ['?amount=0', '?amount=-1', '?amount=0.000000001', '?amount=21000001', '?amount=1&amount=2', '?amount=1&address=' + f.address, '?amount=1&amount.1=2', '?amount=1&req-asset=AA', '?amount=1&unknown=1', '?amount=1&memo=AA==', '?amount=1#fragment', '?amount=%31', '?amount=1&message=%FF']) {
  await assert.rejects(parsePaymentUri('zcash:' + f.address + suffix, 'testnet', f.validateAddress));
 }
 await assert.rejects(parsePaymentUri(f.invoice.paymentUri, 'testnet'), fails('address_validator_required'));
 await assert.rejects(parsePaymentUri(f.invoice.paymentUri, 'testnet', async () => ({ network: 'testnet', shielded: false })), fails('invalid_or_unshielded_address'));
 assert.equal((await parsePaymentUri('zcash:?address=' + f.address + '&amount=000.0100', 'testnet', f.validateAddress)).amountZatoshis, '1000000');
});
test('registration proof binds exact PR bytes and maintainer-issued challenge', async () => {
 const expected = { version: 1, registryId: 'test-registry', merchantId: 'example', kid: 'merchant-1', origin: f.invoice.origin, recordSha256: f.hashRecord(), challenge: Buffer.alloc(32, 5).toString('base64url'), issuedAt: f.now, expiresAt: f.now + 1000 };
 const jws = await signRegistrationProof(expected, { sign: f.merchantKey.sign });
 const opts = { record: f.record, recordBytes: f.recordBytes(), expected, now: f.now };
 assert.equal((await verifyRegistrationProof(jws, opts)).merchantId, 'example');
 await assert.rejects(verifyRegistrationProof(jws, { ...opts, expected: { ...expected, challenge: 'other' } }), fails('proof_challenge_mismatch'));
 await assert.rejects(verifyRegistrationProof(jws, { ...opts, recordBytes: Buffer.from(JSON.stringify(f.record, null, 2)) }), fails('proof_record_mismatch'));
});
test('merchant domains cannot use wildcards, paths, unicode ambiguity, IP or duplicate keys', () => {
 for (const origin of ['http://shop.example.com', 'https://*.example.com', 'https://shop.example.com/pay', 'https://127.0.0.1', 'https://example.com:443', 'https://exämple.com', 'https://-bad.example']) {
  assert.throws(() => validateMerchantRecord({ ...f.record, origins: [origin] }));
 }
 assert.throws(() => validateMerchantRecord({ ...f.record, paymentKeys: [f.record.paymentKeys[0], f.record.paymentKeys[0]] }));
});

test('published full-protocol fixture is verifiable without regenerating signatures', async () => {
 const { readFile } = await import('node:fs/promises');
 const fixture = JSON.parse(await readFile(new URL('../docs/protocol-fixture.json', import.meta.url), 'utf8'));
 const registry = await verifyRegistry(fixture.registryJws, { trust: fixture.trust, state: f.memoryState(), now: fixture.now });
 const result = await verifyInvoice(fixture.invoiceJws, { registry, network: 'testnet', context: { kind: 'import' }, validateAddress: f.validateAddress, now: fixture.now });
 for (const field of ['amountZatoshis', 'memoBase64url']) assert.equal(result.payment[field], fixture.expected[field]);
 assert.equal(result.verification, fixture.expected.verification);
});
