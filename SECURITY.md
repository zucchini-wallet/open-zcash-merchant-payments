# Security

This alpha is not audited and must not authorize production payments. There are
no production trust roots in this repository. Tests include explicitly public
fixture keys; the demo generates ephemeral keys. Never use either in production.

Report sensitive issues through GitHub private vulnerability reporting if enabled.
If it is unavailable, request a private contact without posting exploit details,
keys or customer data in a public issue.

The verifier authenticates issuer-authorized terms. Host wallets remain responsible
for trusted address decoding, document context, durable monotonic registry state,
invoice replay tracking, review-to-signing binding and transaction recovery.
A malicious merchant/backend/key can issue malicious invoices. Compromised release
keys can alter registry bindings. Do not treat registration as a commerce guarantee.

Signed data is public, not encrypted. Keep PII out of labels, memos and invoice URLs.
Registry releases must contain no customer invoice data. Never expose arbitrary
client-provided payment fields to the backend invoice signing endpoint.

Production enablement requires protected review/release configuration, separate
release keys, recovery and revocation drills, security review, and verified wallet
end-to-end testnet flows. CI here intentionally cannot publish or sign releases.
