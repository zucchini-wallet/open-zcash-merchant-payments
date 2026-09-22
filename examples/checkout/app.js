import { verifyRegistry, verifyInvoice, assertCheckpoint } from '/src/index.js';
const $ = (id) => document.getElementById(id);
let checkpoint, config, compact;
const state = { async accept(next) { assertCheckpoint(checkpoint, next); checkpoint = next; } }; // Demo RAM only.
async function run(button, fn) {
 button.disabled = true;
 try { await fn(); } catch (e) { $('status').textContent = `Verification failed: ${e.code ?? e.message}. No payment was made.`; }
 finally { button.disabled = false; }
}
$('create').onclick = () => run($('create'), async () => {
 config = await (await fetch('/api/config')).json();
 const response = await fetch('/api/invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: 'demo-order' }) });
 if (!response.ok) throw new Error('Invoice creation failed');
 compact = (await response.json()).invoice; $('invoice').value = compact; $('review').hidden = false; $('details').replaceChildren();
 $('status').textContent = 'Invoice received. Verify it before trusting its payment details.';
});
$('verify').onclick = () => run($('verify'), async () => {
 const registry = await verifyRegistry(config.registry, { trust: config.trust, state });
 const result = await verifyInvoice(compact, { registry, network: 'testnet', context: { kind: 'import' }, validateAddress: async (a, n) => a === config.address && n === 'testnet' ? { network: n, shielded: true } : null });
 $('details').replaceChildren();
 for (const [label, value] of [['Issuer', result.invoice.origin], ['Amount', result.payment.amountZatoshis + ' zatoshis'], ['Recipient', result.payment.address], ['Verification', result.verification]]) {
  const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; $('details').append(dt, dd);
 }
 $('status').textContent = 'Signature and payment request verified. This preview has no signing or send capability.';
});
$('tamper').onclick = () => {
 if (!compact) return;
 const parts = compact.split('.');
 const payload = JSON.parse(atob(parts[1].replaceAll('-', '+').replaceAll('_', '/')));
 payload.paymentUri = payload.paymentUri.replace('amount=0.01', 'amount=1.00');
 parts[1] = btoa(JSON.stringify(payload)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
 compact = parts.join('.'); $('invoice').value = compact; $('details').replaceChildren();
 $('status').textContent = 'Amount changed without the merchant key. Click Verify invoice to see it rejected.';
};
