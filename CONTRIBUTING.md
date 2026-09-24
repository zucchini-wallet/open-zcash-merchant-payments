# Contributing

The protocol is experimental. Open issues for interoperability changes before
relying on draft fields or RPC names. No production merchant enrollment is active
until release trust roots and maintainer governance have been provisioned.

For a merchant submission, prepare `merchants/<id>.json` conforming to
`schemas/protocol.json#/$defs/merchant`. Include exact HTTPS origins and public
invoice keys only. Never submit spending keys, private invoice keys, customer
addresses, invoice contents or transaction history.

A maintainer issues a challenge from the exact proposed record:

```
node scripts/create-challenge.mjs merchants/example.json registry-id https://shop.example.com payments-1 zucchini-wallet/open-zcash-merchant-payments <record-commit>
```

The maintainer records the reviewed PR head and challenge outside untrusted PR
input. The merchant publishes the specified DNS TXT record and signs the challenge
using `signRegistrationProof`. To verify against the maintainer's trusted file:

```
node scripts/verify-domain.mjs merchants/example.json proof.jws trusted-challenge.json zucchini-wallet/open-zcash-merchant-payments <record-commit>
```

Repeat for every new origin/key combination. A successful command is proof of
control/possession only; it is not authorization to merge or publish. Key rotation,
revocation, loss and domain transfer follow docs/registry.md. Names and branding
are reviewed separately from domain ownership.

Run `npm test` and `npm run check` before submitting changes. Security-sensitive
schema or byte-encoding changes need updated interoperable fixtures and a version
change. PR workflows have no signing secrets and cannot publish a registry.

See [operator lifecycle](docs/operator-lifecycle.md) for the approval ledger, rotation, recovery and signed snapshots. The envelope contains the repository and commit; sign only its `proof` payload.
