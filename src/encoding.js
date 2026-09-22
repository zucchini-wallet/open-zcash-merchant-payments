export class ProtocolError extends Error {
  constructor(code) { super(code); this.name = 'ProtocolError'; this.code = code; }
}
export function requireThat(condition, code) { if (!condition) throw new ProtocolError(code); }
export const utf8 = (s) => new TextEncoder().encode(s);
export const text = (b) => {
  try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(b); }
  catch { throw new ProtocolError('invalid_utf8'); }
};
export function b64(bytes) {
  let str = ''; for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export function unb64(s, size) {
  requireThat(typeof s === 'string' && /^[A-Za-z0-9_-]+$/.test(s), 'invalid_base64url');
  let bytes;
  try { bytes = Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0)); }
  catch { throw new ProtocolError('invalid_base64url'); }
  requireThat(b64(bytes) === s && (size === undefined || bytes.length === size), 'invalid_base64url');
  return bytes;
}
export async function digest(bytes) { return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))); }
export function freeze(value) {
  if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); Object.freeze(value); }
  return value;
}

// Recursive-descent JSON parser. JSON.parse alone silently accepts duplicate keys.
// All protocol JSON is bounded before parsing; nesting has a separate bound.
export function strictJSON(input, maxBytes = 32768) {
  requireThat(typeof input === 'string' && utf8(input).length <= maxBytes, 'json_size');
  let i = 0;
  const ws = () => { while (/[\x20\t\n\r]/.test(input[i] ?? '') && i < input.length) i++; };
  const str = () => {
    const start = i++;
    while (i < input.length) {
      const c = input[i++];
      if (c === '\\') { i++; continue; }
      if (c === '"') {
        let result;
        try { result = JSON.parse(input.slice(start, i)); } catch { throw new ProtocolError('invalid_json'); }
        // Reject unpaired UTF-16 surrogates instead of allowing lossy encoding.
        requireThat(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(result), 'invalid_unicode');
        return result;
      }
    }
    throw new ProtocolError('invalid_json');
  };
  function value(depth) {
    requireThat(depth <= 32, 'json_depth'); ws();
    const c = input[i];
    if (c === '"') return str();
    if (c === '{') {
      i++; ws(); const result = Object.create(null); const keys = new Set();
      if (input[i] === '}') { i++; return result; }
      while (true) {
        requireThat(input[i] === '"', 'invalid_json'); const key = str();
        requireThat(!keys.has(key), 'duplicate_json_key'); keys.add(key); ws();
        requireThat(input[i++] === ':', 'invalid_json'); result[key] = value(depth + 1); ws();
        const end = input[i++]; if (end === '}') return result;
        requireThat(end === ',', 'invalid_json'); ws();
      }
    }
    if (c === '[') {
      i++; ws(); const result = [];
      if (input[i] === ']') { i++; return result; }
      while (true) {
        result.push(value(depth + 1)); ws(); const end = input[i++]; if (end === ']') return result;
        requireThat(end === ',', 'invalid_json'); ws();
      }
    }
    for (const [literal, v] of [['true', true], ['false', false], ['null', null]]) {
      if (input.startsWith(literal, i)) { i += literal.length; return v; }
    }
    const match = input.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    requireThat(match, 'invalid_json'); i += match[0].length;
    const n = Number(match[0]); requireThat(Number.isFinite(n), 'invalid_number'); return n;
  }
  const result = value(0); ws(); requireThat(i === input.length, 'invalid_json'); return result;
}
