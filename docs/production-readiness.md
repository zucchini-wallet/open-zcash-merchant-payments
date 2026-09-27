# Merchant production rollout — September 27

## Agreed boundaries

`merchant.zucchinifi.xyz` is for business registration/management only. Merchant
checkout stays on the merchant's own registered origin. This is independent of
the X social-address registry. Public signed registry data is planned at
`https://api.zucchinifi.xyz/merchant-registry/v1/registry.jws`.

## Prepared, not activated

- Static portal preview validates public records using the protocol schema; no
  private material, payments or submission backend. Preview explicitly says
  enrollment is not open.
- Publication host verifies signed snapshots and monotonic checkpoints and retains
  immutable versions in a Durable Object. Missing/expired latest state fails closed.
  Dry-run bundles successfully; no remote bindings, routes or tokens created.
- Extension staging supports configurable mainnet/testnet merchant verification,
  a fixed production HTTPS source, bounded fetch without credentials/redirects,
  encrypted persistent rollback checkpoints and fresh verification before signing.
  Public fixture roots are rejected by production build configuration.
- Production merchant config remains disabled. Existing 0.5.2 store release has
  not been changed, uploaded or submitted. The enabled feature needs a new version.

## Required activation evidence

1. Owner designated `elviric` as sole reviewer for September 27, 2026,
   Asia/Kolkata, with no self-approval. Operator tooling expires the exception
   at 18:30 UTC; configure a second reviewer for subsequent changes.
2. Provision registry ID, release key custody and durable signer state. Place only
   the public key/minimum sequence in extension trust. Publication token is separate
   from the signing key and from each merchant's invoice key.
3. Deploy the data host, narrow API routes, portal domain and proof/review tracking.
   Connect the signing job (at least every six hours) and external alert delivery;
   a log message alone is not operator notification.
4. Exercise real DNS/key proofs, reviewer approval, enrollment, rotation, recovery,
   suspension and revocation through the operational path. No production merchants
   have been enrolled. Obtain a real checkout origin for funded acceptance.
5. Validate the extension against production roots in staging, including expiry,
   unavailable host, rollback, revoked invoice, wrong origin/network, and interrupted
   approvals. Perform an explicitly approved funded checkout and backend receipt
   confirmation. Unit fixtures are not evidence of that payment.
6. Enable pinned production configuration, increment extension version, build and
   audit the exact package, update disclosures as needed, then submit the new release.

Registry governance normally requires two-person review, with the dated owner-authorized
exception documented in `operator-lifecycle.md`;
wallets verify one configured release signature. This is not threshold cryptography
and does not eliminate trust in the registry operator/root key.
