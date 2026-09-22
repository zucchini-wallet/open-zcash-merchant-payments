import { requireThat as check, b64, unb64, utf8, text, strictJSON, digest } from './encoding.js';
import { shape, kid } from './validation.js';
export function decodeJws(compact, purpose, max = 32768) {
  check(typeof compact === 'string' && compact.length <= max, 'jws_size');
  const parts = compact.split('.'); check(parts.length === 3, 'invalid_jws');
  const headerBytes = unb64(parts[0]); check(headerBytes.length <= 512, 'header_size');
  const header = strictJSON(text(headerBytes), 512);
  shape(header, ['alg', 'typ', 'kid']); kid(header.kid);
  check(header.alg === 'Ed25519', 'unsupported_algorithm'); check(header.typ === purpose, 'wrong_purpose');
  const payloadBytes = unb64(parts[1]);
  return { header, payloadBytes, signature: unb64(parts[2], 64), signingInput: utf8(parts[0] + '.' + parts[1]) };
}
export async function verifyJws(decoded, publicKey) {
  const key = await crypto.subtle.importKey('raw', unb64(publicKey, 32), 'Ed25519', false, ['verify']);
  check(await crypto.subtle.verify('Ed25519', key, decoded.signature, decoded.signingInput), 'invalid_signature');
  return strictJSON(text(decoded.payloadBytes), decoded.payloadBytes.length);
}
// The callback receives bytes only; applications may use a protected key or KMS.
export async function signJws(payload, purpose, keyId, signer) {
  kid(keyId);
  const header = { alg: 'Ed25519', typ: purpose, kid: keyId };
  // Roundtrip through strict parser prevents unsupported/ambiguous JS values.
  const serialized = JSON.stringify(payload);
  const roundtrip = strictJSON(serialized, 4 * 1024 * 1024);
  const h = b64(utf8(JSON.stringify(header))); const p = b64(utf8(JSON.stringify(roundtrip)));
  const input = h + '.' + p;
  const sig = await signer(utf8(input)); check(sig instanceof Uint8Array && sig.length === 64, 'invalid_signature_size');
  return input + '.' + b64(sig);
}
export const payloadDigest = (decoded) => digest(decoded.payloadBytes);
