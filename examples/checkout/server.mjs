import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { signInvoice, signRegistry } from '../../src/server.js';
import { strictJSON } from '../../src/index.js';
import { address, validateAddress } from '../../tests/fixtures.mjs';
const port = Number(process.env.PORT ?? 4318);
const createSigner = () => {
 const { privateKey, publicKey } = generateKeyPairSync('ed25519');
 return { publicKey: publicKey.export({ format: 'jwk' }).x, sign: async (b) => new Uint8Array(sign(null, b, privateKey)) };
};
const root = createSigner(), merchant = createSigner();
const origin = 'https://shop.example.com';
const start = Math.floor(Date.now() / 1000);
// Only a fixed server-owned test order exists. Clients cannot supply a recipient,
// amount, memo, network or arbitrary URI to this signing endpoint.
const order = Object.freeze({ id: 'demo-order', uri: `zcash:${address}?amount=0.01&memo=aGVsbG8`, network: 'testnet' });
const registry = await signRegistry({ version: 1, registryId: 'demo-only', sequence: 1, issuedAt: start, expiresAt: start + 3600, sourceCommit: '0'.repeat(40), merchants: [{ version: 1, id: 'example', name: 'Demo Merchant — no payment', origins: [origin], status: 'active', paymentKeys: [{ kid: 'demo-merchant', algorithm: 'Ed25519', publicKey: merchant.publicKey, networks: ['testnet'], notBefore: start, expiresAt: start + 7200 }] }], revocations: [] }, { kid: 'demo-release', sign: root.sign });
const server = createServer(async (req, res) => {
 const send = (status, body, type = 'application/json') => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'" }); res.end(body); };
 try {
  if (req.headers.host !== `127.0.0.1:${port}`) return send(403, '{}');
  const path = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
  if (req.method === 'GET' && path === '/api/config') return send(200, JSON.stringify({ trust: { registryId: 'demo-only', minimumSequence: 1, roots: [{ kid: 'demo-release', publicKey: root.publicKey }] }, registry, address }));
  if (req.method === 'POST' && path === '/api/invoice') {
   if (req.headers.origin !== `http://127.0.0.1:${port}`) return send(403, '{}');
   let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1024) return send(413, '{}'); }
   const input = strictJSON(body);
   if (Object.keys(input).length !== 1 || input.orderId !== order.id) return send(400, JSON.stringify({ error: 'Unknown order or client-supplied payment fields' }));
   const issuedAt = Math.floor(Date.now() / 1000);
   const payload = { version: 1, registryId: 'demo-only', merchantId: 'example', kid: 'demo-merchant', origin, network: order.network, invoiceId: randomUUID(), issuedAt, expiresAt: issuedAt + 600, paymentUri: order.uri };
   return send(200, JSON.stringify({ invoice: await signInvoice(payload, { sign: merchant.sign, validateAddress }) }));
  }
  const staticFiles = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
  if (req.method === 'GET' && staticFiles[path]) { const [file, type] = staticFiles[path]; return send(200, await readFile(new URL(file, import.meta.url)), type); }
  if (req.method === 'GET' && /^\/src\/(index|encoding|validation|jws|zip321)\.js$/.test(path)) return send(200, await readFile(new URL('../..' + path, import.meta.url)), 'text/javascript');
  return send(404, '{}');
 } catch (e) { return send(400, JSON.stringify({ error: e.code ?? 'invalid_request' })); }
});
server.listen(port, '127.0.0.1', () => console.log(`Verification-only checkout: http://127.0.0.1:${port}. No wallet connection or funds sent.`));
