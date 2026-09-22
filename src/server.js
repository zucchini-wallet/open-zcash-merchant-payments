// Server-only API. No filesystem/private-key storage conventions are imposed.
import { invoice, registry, proof } from './validation.js';
import { signJws } from './jws.js';
import { parsePaymentUri } from './zip321.js';
import { strictJSON, requireThat as check } from './encoding.js';
function copy(value) { return strictJSON(JSON.stringify(value), 4 * 1024 * 1024); }
export async function signInvoice(value, { sign, validateAddress }) {
  const payload = copy(value); invoice(payload);
  await parsePaymentUri(payload.paymentUri, payload.network, validateAddress);
  const result = await signJws(payload, 'zcash-merchant-invoice+jws', payload.kid, sign);
  check(result.length <= 32768, 'jws_size'); return result;
}
export async function signRegistry(value, { kid, sign }) {
  const payload = copy(value); registry(payload);
  const result = await signJws(payload, 'zcash-merchant-registry+jws', kid, sign);
  check(result.length <= 4 * 1024 * 1024, 'jws_size'); return result;
}
export async function signRegistrationProof(value, { sign }) {
  const payload = copy(value); proof(payload);
  return signJws(payload, 'zcash-merchant-registration+jws', payload.kid, sign);
}
