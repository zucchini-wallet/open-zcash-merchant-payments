import { createPrivateKey, createPublicKey, sign, createHash } from 'node:crypto';
import { signRegistry, signInvoice } from '../src/server.js';
import { verifyRegistry, assertCheckpoint } from '../src/index.js';
export const now = 1790078400;
export const address = 'ztestsapling10yy2ex5dcqkclhc7z7yrnjq2z6feyjad56ptwlfgmy77dmaqqrl9gyhprdx59qgmsnyfska2kez';
// Test adapter accepts this one published ZIP 321 example only. Not a general decoder.
export const validateAddress = async (a, n) => a === address && n === 'testnet' ? { network: n, shielded: true } : null;
export const key = (byte) => {
 const priv = createPrivateKey({ key: Buffer.from('302e020100300506032b657004220420' + byte.repeat(32), 'hex'), type: 'pkcs8', format: 'der' });
 return { publicKey: createPublicKey(priv).export({ format: 'jwk' }).x, sign: async (b) => new Uint8Array(sign(null, b, priv)) };
};
export const root = key('11'), merchantKey = key('22');
export const record = { version: 1, id: 'example', name: 'Example Shop', origins: ['https://shop.example.com'], status: 'active', paymentKeys: [{ kid: 'merchant-1', algorithm: 'Ed25519', publicKey: merchantKey.publicKey, networks: ['testnet'], notBefore: now - 100, expiresAt: now + 86400 }] };
export const registryPayload = { version: 1, registryId: 'test-registry', sequence: 1, issuedAt: now, expiresAt: now + 3600, sourceCommit: '0'.repeat(40), merchants: [record], revocations: [] };
export const invoice = { version: 1, registryId: 'test-registry', merchantId: 'example', kid: 'merchant-1', origin: 'https://shop.example.com', network: 'testnet', invoiceId: 'order-1', issuedAt: now, expiresAt: now + 600, paymentUri: `zcash:${address}?amount=0.01&memo=aGVsbG8` };
export const trust = { registryId: 'test-registry', minimumSequence: 1, roots: [{ kid: 'release-1', publicKey: root.publicKey }] };
export function memoryState() { let previous; return { async accept(next) { assertCheckpoint(previous, next); previous = next; } }; }
export const signedRegistry = (payload = registryPayload) => signRegistry(payload, { kid: 'release-1', sign: root.sign });
export const signedInvoice = (payload = invoice) => signInvoice(payload, { sign: merchantKey.sign, validateAddress });
export async function snapshot(payload = registryPayload, state = memoryState()) { return verifyRegistry(await signedRegistry(payload), { trust, state, now }); }
export const recordBytes = () => Buffer.from(JSON.stringify(record));
export const hashRecord = () => createHash('sha256').update(recordBytes()).digest('hex');
