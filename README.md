# Open Zcash Merchant Payments

An open, wallet-independent authentication layer for merchant ZIP 321 payment
requests. Merchants publish domain/key bindings through a reviewed public registry,
then sign invoices on their backend. Implementing wallets verify the issuer and
payment details before asking the user to approve the transaction.

**Status: experimental alpha, not audited or production-enabled.** There are no
registered merchants or production release keys yet. Existing ZIP 321 wallets can
use plain payment URIs, but must adopt this protocol to verify merchant signatures.
This repository is independent of social identity/address registries.

## Implemented

- Browser-compatible JWS/Ed25519 invoice and registry verification using WebCrypto.
- Server signing through a callback, allowing external key storage/KMS integration.
- Strict JSON, bounded inputs, protected signature headers and explicit algorithms.
- Registry freshness, pinned roots and a host-supplied atomic anti-rollback store.
- Merchant status, domain, key lifetime, network, revocation and challenge checks.
- Initial ZIP 321 profile: one explicit shielded ZEC payment; unsupported fields fail.
- Registration proof verification and maintainer-issued DNS TXT challenge tooling.
- Tests for tampering, rollback, expired/revoked keys, origin/session mismatch and
  malformed input. Reproducible signature fixtures are included.
- Verification-only local checkout demo; it cannot send funds.

## Run

Node 22.19+; no runtime dependencies or installation needed:

```sh
npm test
npm run check
npm run example
```

Open `http://127.0.0.1:4318`. Generate an invoice, verify it, then tamper with the
amount and verify again. The demo uses ephemeral keys and one published ZIP 321
address fixture. Its RAM checkpoint store and server-supplied trust configuration
are explicitly **not** production wallet implementations.

## Library boundaries

`@zucchinifi/merchant-payments` exports `verifyRegistry`, `verifyInvoice`,
`verifyRegistrationProof`, `parsePaymentUri`, and validation helpers. The `/server`
entry point exports `signInvoice`, `signRegistry` and `signRegistrationProof`.
The npm package has not been published; local tarballs can be used for integration.

The host wallet must supply:

1. Its own pinned registry trust root and minimum sequence.
2. An atomic, durable `state.accept(checkpoint)` that calls `assertCheckpoint`
   against stored state and persists the new checkpoint before resolving.
3. A trusted full Zcash address decoder/receiver selector as `validateAddress`.
   Prefix matching is insufficient. Return `{network, shielded:true}` only after
   checksum, network and shielded receiver validation.
4. Browser-derived origin/document context, wallet-generated challenges, expiry
   and lifecycle enforcement. Portable imports authenticate issuer only.
5. Durable invoice replay reservations, exact transaction review, approved-proposal
   binding, and signed-transaction/broadcast recovery. Verification is not approval.
6. A fresh verification immediately before signing using the latest authenticated
   snapshot. Do not retain a previously verified result as spending authorization.

`verifyInvoice` returns parsed payment terms and an invoice digest/replay key; it
neither signs spending transactions nor claims that a payment has occurred.
Merchant invoice keys are separate from Zcash wallet spending/viewing keys.

## Specification and registry

- [Protocol](docs/protocol.md)
- [Registry operations and recovery](docs/registry.md)
- [Schemas](schemas/protocol.json)
- [Adoption and acceptance gates](docs/acceptance.md)
- [Contribution instructions](CONTRIBUTING.md)
- [Security boundaries](SECURITY.md)

CI validates records and tests only. No PR triggers registry signing, deployment
or package publication. Production release governance, root provisioning, an
independent security review and wallet end-to-end testnet acceptance are still
required. A valid domain/signature does not establish honest fulfillment.

Licensed under MIT OR Apache-2.0.

For backend/browser API responsibilities and the draft wallet handshake, see
[SDK integration](docs/sdk-integration.md). A complete, fixed-clock signed registry
and invoice fixture is in [protocol-fixture.json](docs/protocol-fixture.json).
