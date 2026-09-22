import { requireThat as check, unb64, freeze, utf8 } from './encoding.js';
import { network as validateNetwork } from './validation.js';

// Initial merchant profile deliberately supports one explicit shielded ZEC payment.
// The injected wallet-core validator must decode/validate the complete address,
// including UA receiver selection; a prefix or checksum alone is insufficient.
export async function parsePaymentUri(uri, network, validateAddress) {
  validateNetwork(network);
  check(typeof validateAddress === 'function', 'address_validator_required');
  check(typeof uri === 'string' && utf8(uri).length <= 16384 && uri.startsWith('zcash:'), 'invalid_uri');
  const match = /^zcash:([A-Za-z0-9]*)(?:\?([^#]*))?$/.exec(uri); check(match, 'invalid_uri');
  const params = new Map();
  if (match[2] !== undefined) {
    check(match[2].length > 0, 'invalid_uri');
    for (const item of match[2].split('&')) {
      const eq = item.indexOf('='); check(eq > 0, 'invalid_uri');
      const name = item.slice(0, eq); const raw = item.slice(eq + 1);
      // Reject indexed/multiple outputs and unknown parameters; never drop them.
      check(['address', 'amount', 'memo', 'label', 'message'].includes(name), 'unsupported_uri_parameter');
      check(!params.has(name), 'duplicate_uri_parameter');
      if (name === 'label' || name === 'message') {
        check(/^(?:[A-Za-z0-9._~!$'()*+,;:@-]|%[a-fA-F0-9]{2})*$/.test(raw), 'invalid_uri_text');
        let decoded; try { decoded = decodeURIComponent(raw); } catch { check(false, 'invalid_uri_text'); }
        check(!/[\p{Cc}\p{Cf}]/u.test(decoded), 'invalid_uri_text'); params.set(name, decoded);
      } else params.set(name, raw);
    }
  }
  check(!(match[1] && params.has('address')), 'duplicate_uri_parameter');
  const address = match[1] || params.get('address'); check(typeof address === 'string' && /^[A-Za-z0-9]+$/.test(address), 'invalid_address');
  const amount = params.get('amount'); check(typeof amount === 'string' && /^\d+(?:\.\d{1,8})?$/.test(amount) && amount.length <= 32, 'invalid_amount');
  const [whole, fraction = ''] = amount.split('.');
  const zatoshis = BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0'));
  check(zatoshis > 0n && zatoshis <= 2100000000000000n, 'invalid_amount');
  const memo = params.get('memo');
  const memoBytes = memo === undefined || memo === '' ? new Uint8Array() : unb64(memo);
  check(memoBytes.length <= 512, 'invalid_memo');
  const validation = await validateAddress(address, network);
  check(validation && validation.network === network && validation.shielded === true, 'invalid_or_unshielded_address');
  return freeze({ address, amountZatoshis: zatoshis.toString(), memoBase64url: memo ?? '',
    ...(params.has('label') ? { label: params.get('label') } : {}),
    ...(params.has('message') ? { message: params.get('message') } : {}) });
}
