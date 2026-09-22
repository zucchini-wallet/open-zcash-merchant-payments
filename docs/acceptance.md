# Implementation and adoption plan

This is an experimental implementation of the draft. Public method names below are conceptual,
not a finalized or published SDK API. The existing extension bridge draft is not
evidence of merchant-verification support.

## Package boundaries

| Surface | Planned responsibility |
| --- | --- |
| Backend SDK entry point | Build ZIP 321 from server-owned orders, create/sign invoices through a signer callback or KMS adapter. |
| Browser SDK entry point | Detect verification capability, submit signed invoices, render ordinary URI fallback, handle explicit outcomes. Never import server signing code. |
| Independent verifier | Registry/JWS/schema/URI policy verification with portable test vectors; usable without a Zucchini account or gateway session. |
| Wallet bridge | Browser-origin and document binding, permissions, immutable approval and durable replay/recovery state. |
| Wallet core | Address validation, transaction construction, proving and spending-key signing. No merchant registry policy in the key engine. |
| Merchant receiving service | Observe shielded receipts, confirm amounts/memos, reconcile invoice state and duplicates. |

A wallet advertises explicit signed-invoice version/network/payment-feature support.
Do not infer support from wallet name or an ordinary sendTransaction method. An
unsupported-method response before submission is different from an uncertain send.
Preserve legacy SDK methods through an explicit compatibility adapter, never route
a failed signed request automatically into legacy unsigned sending.

## Required acceptance matrix

Automated coverage is in tests/protocol.test.mjs. Browser-to-wallet spending,
operational recovery and independent implementation gates below remain outstanding.

- Registry: forged signature, wrong registry/environment/root, rollback/equal-version
  equivocation, expiration, oversized input, offline stale cache, root recovery.
- Enrollment: stolen GitHub identity, expired challenge, changed PR head, domain
  mismatch, duplicate ownership, new-origin proof, compromised/lost-key recovery.
- Encoding: duplicate keys, invalid UTF-8, noncanonical base64url, extra header,
  alg=none, wrong typ/kid, unsupported fields, bad timestamps and URI ambiguity.
- Invoice: modified address, amount, memo, origin, network or invoice ID; wrong key;
  expiry; revoked key; absent/mismatched challenge; multi-output requests never
  partially paid; unsupported assets and privacy requirements rejected.
- Bridge: hostile same-origin script, spoofed page metadata, cross-origin iframe,
  navigation, document replacement, concurrent requests, permission removal, lock,
  network change, malicious message flood and oversized requests.
- Approval: changes during review, fee change, proposal/output mismatch, rejection,
  closed window, exact approved proposal consumed once, encrypted persistence.
- Recovery: crash before/after signing and broadcast, uncertain RPC result, pending
  invoice on restart, duplicate tabs, duplicate invoice across different wallets.
- Interoperability: Node, browser WebCrypto and independent non-JS implementation;
  portable QR/file imports honestly show issuer-only verification; old wallets get
  ordinary URI compatibility only; failed verification never downgrades silently.
- Privacy: no keys or customer payments in registry, no per-merchant remote lookup,
  no viewing-key export; logs omit invoice payloads, memos and sensitive URLs.

## Delivery order

1. Review this draft, schemas and cryptographic fixtures; settle initial payment
   feature subset, governance and transport with prospective wallet implementers.
2. Configure protected CI/release governance for the public registry repository. Provision
   real release keys separately; fixture keys must never be accepted in production.
3. Implement the independent verifier, full semantic fixtures and adversarial tests.
4. Add backend/browser SDK entry points and a reference merchant with server-owned
   orders. Audit browser bundles for absence of private-key/server dependencies.
5. Integrate the extension's existing transaction approval/recovery path, then native
   apps. Validate on testnet before any real merchant mainnet payment.
6. Seek another wallet implementation and publish an interoperability proposal.

Blocking production gates: external security review of signing/verification and
approval binding; verified testnet payment/receipt; replay and recovery acceptance;
operational revocation drill; public ownership/recovery policy; no unfinished bridge
code accidentally included in a store release. None is claimed complete here.
