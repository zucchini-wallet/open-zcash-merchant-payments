// Specification fixtures only. Not an invoice verifier or production signer.
import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, sign, verify, webcrypto } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// Public, deterministic test-only seeds. Never use these keys for a real registry.
const keyFromSeed = (hex) => createPrivateKey({
  key: Buffer.from('302e020100300506032b657004220420' + hex, 'hex'),
  format: 'der', type: 'pkcs8',
});
const key = keyFromSeed('11'.repeat(32));
const wrongKey = createPublicKey(keyFromSeed('22'.repeat(32)));
const publicKey = createPublicKey(key);
const jwk = publicKey.export({ format: 'jwk' });
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const header = { alg: 'Ed25519', typ: 'zcash-merchant-invoice+jws', kid: 'fixture-only' };
const payload = {
  version: 1, registryId: 'test-registry', merchantId: 'example', kid: 'fixture-only',
  origin: 'https://shop.example.com', network: 'testnet', invoiceId: 'fixture-001',
  issuedAt: 1790078400, expiresAt: 1790079000,
  // Intentionally NOT a valid Zcash address: these fixtures isolate signature
  // verification. A full payment verifier MUST reject this payment URI.
  paymentUri: 'zcash:TEST_ONLY_NOT_AN_ADDRESS?amount=0.01&memo=aGVsbG8',
  challenge: Buffer.alloc(32, 3).toString('base64url'),
};
const input = encode(header) + '.' + encode(payload);
const signature = sign(null, Buffer.from(input), key).toString('base64url');
const original = input + '.' + signature;
const mutate = (part, replacement) => {
  const parts = original.split('.');
  parts[part] = encode(replacement);
  return parts.join('.');
};
const vectors = [{ name: 'signature-valid-payment-invalid', jws: original, signatureValid: true }];
for (const [name, change] of Object.entries({
  recipient: { paymentUri: payload.paymentUri.replace('TEST_ONLY_NOT_AN_ADDRESS', 'ATTACKER') },
  amount: { paymentUri: payload.paymentUri.replace('0.01', '1.00') },
  memo: { paymentUri: payload.paymentUri.replace('aGVsbG8', 'dGFtcGVyZWQ') },
  origin: { origin: 'https://attacker.example' },
  network: { network: 'mainnet' },
  invoiceId: { invoiceId: 'different-invoice' },
  expiry: { expiresAt: payload.expiresAt + 1 },
  challenge: { challenge: Buffer.alloc(32, 4).toString('base64url') },
})) vectors.push({ name: 'tampered-' + name, jws: mutate(1, { ...payload, ...change }), signatureValid: false });
vectors.push({ name: 'tampered-algorithm', jws: mutate(0, { ...header, alg: 'none' }), signatureValid: false });
vectors.push({ name: 'tampered-purpose', jws: mutate(0, { ...header, typ: 'zcash-merchant-registry+jws' }), signatureValid: false });
vectors.push({ name: 'tampered-key-id', jws: mutate(0, { ...header, kid: 'other' }), signatureValid: false });
const fixture = {
  warning: 'PUBLIC TEST KEY. Signature-layer fixtures only; every payment URI here is invalid.',
  testSeedHex: '11'.repeat(32), publicKey: jwk.x, header, payload, signingInput: input, vectors,
};
const fixtureUrl = new URL('./signature-vectors.json', import.meta.url);
if (process.argv.includes('--write')) writeFileSync(fixtureUrl, JSON.stringify(fixture, null, 2) + '\n');
assert.deepEqual(JSON.parse(readFileSync(fixtureUrl, 'utf8')), fixture, 'fixture drift');
const cryptoKey = await webcrypto.subtle.importKey('raw', Buffer.from(jwk.x, 'base64url'), 'Ed25519', false, ['verify']);
for (const v of vectors) {
  const [h, p, s] = v.jws.split('.');
  const bytes = Buffer.from(h + '.' + p);
  const sig = Buffer.from(s, 'base64url');
  assert.equal(verify(null, bytes, publicKey, sig), v.signatureValid, v.name + ': Node');
  assert.equal(await webcrypto.subtle.verify('Ed25519', cryptoKey, sig, bytes), v.signatureValid, v.name + ': WebCrypto');
  assert.equal(verify(null, bytes, wrongKey, sig), false, v.name + ': wrong key');
}
console.log(`${vectors.length} signature fixtures passed Node crypto, WebCrypto, and wrong-key checks. Not full protocol validation.`);
