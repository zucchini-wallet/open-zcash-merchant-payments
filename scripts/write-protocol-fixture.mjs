// Reproducible, public test-only keys come from tests/fixtures.mjs.
import { writeFile } from 'node:fs/promises';
import * as f from '../tests/fixtures.mjs';
const fixture = {
 warning: 'TEST ONLY: public deterministic keys, fixed historical clock, no production trust.',
 now: f.now, trust: f.trust, merchant: f.record, registryPayload: f.registryPayload,
 invoicePayload: f.invoice, registryJws: await f.signedRegistry(), invoiceJws: await f.signedInvoice(),
 expected: { amountZatoshis: '1000000', memoBase64url: 'aGVsbG8', verification: 'issuer-only' },
};
await writeFile(new URL('../docs/protocol-fixture.json', import.meta.url), JSON.stringify(fixture, null, 2) + '\n');
