# Merchant registration portal

Intended domain: `merchant.zucchinifi.xyz`. This is a business registration and
management entry point, not a checkout or custodial service. Checkout stays on
the merchant's registered origin. Public signed snapshots are a separate API.

Build: `node portal/scripts/build.mjs`. Static output: `portal/dist`.
No third-party scripts, analytics, cookies or network submission. Forms validate
against the shared protocol schema and download a public registration draft.
The preview explicitly states enrollment is not active; it does not invent an
approval or bypass the operator lifecycle. Production activation requires the
configured reviewers, proof issuance and tracking, root custody, signed publication,
refresh and monitoring described in `docs/operator-lifecycle.md`.

Do not collect private invoice keys, viewing keys, wallet seeds or payments here.
Two-reviewer enrollment is a registry governance policy, not a two-signature JWS:
wallets ultimately trust the pinned registry release root.
