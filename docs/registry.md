# Public registry operations — draft

Repository: `zucchini-wallet/open-zcash-merchant-payments`.
Production registration and signed releases remain disabled. Keep one `merchants/<id>.json` per merchant,
`proofs/<id>/` for public attestations, schemas, validator tests, CONTRIBUTING,
SECURITY, CODEOWNERS and protected release workflows. No customer payment data.

## Merchant submission

1. Generate a dedicated Ed25519 invoice-signing key on the merchant backend.
   Do not reuse a Zcash spending key or put a secret in the PR/browser bundle.
2. Submit the merchant record matching schemas.json. All IDs and kids are stable;
   a kid is never reused for a different key. Origin ownership is unique within
   one registry. Business/name review is distinct from domain control.
3. Maintainers issue a fresh random 32-byte nonce, bound to the PR head commit,
   merchant record SHA-256, each exact origin, registry ID and a 24-hour expiry.
4. Publish `_zcash-merchant.<hostname>` DNS TXT with
   `v=1; registry=<id>; merchant=<id>; record=<sha256hex>; challenge=<base64url>`.
   The record hash is over the exact UTF-8 merchant JSON file bytes in that commit.
   A change to the file requires new proof. DNS proof covers the proposed keys.
5. Each newly enrolled key signs a JWS proof with protected header
   `alg=Ed25519`, `typ=zcash-merchant-registration+jws`, and its kid. Payload contains
   exactly version=1, registryId, merchantId, kid, origin, recordSha256,
   challenge, issuedAt, expiresAt. Use the invoice encoding rules; lifetime <=24h.
6. CI verifies syntax, signatures, challenge ownership/freshness and DNS from a
   trusted verification job. Reviewers inspect domain, origin/key changes and
   any branding claims. Recheck DNS immediately before release eligibility.

Untrusted PRs cannot run code with signing credentials. Do not check out PR code
in a privileged pull_request_target workflow. Validators and DNS logic come from
the protected branch. A public DNS proof reveals registration intent, never a secret.
DNS establishes control at verification time, not permanent control or legal identity.

## Signed releases

The builder emits a JWS snapshot with protected header alg=Ed25519,
typ=zcash-merchant-registry+jws and a pinned release kid. Its payload contains
version=1, registryId, sequence, issuedAt, expiresAt, sourceCommit, merchants and
revocations. JSON schemas define shapes, while the validator enforces uniqueness,
chronology and key/origin relationships. No source commit is trusted merely because
its hash appears in the payload; the release signature authenticates the assertion.

Release snapshots last at most 24 hours and refresh at least every 6 hours, with
immediate releases for emergency revocation. Wallets verify signature, expected
registry ID, issue/expiry and a monotonic safe-integer sequence. Persist the highest
accepted sequence and payload hash; reject older sequences or different content at
the same sequence. A fresh install also has a minimum sequence shipped in its app.
Cache the last valid snapshot. Reject verified payments if no fresh snapshot is
available. Never let an invoice supply the release key, mirror or minimum sequence.

Mirror downloads are bounded (initial maximum 4 MiB), HTTPS, and independent of
individual merchant browsing. Use full snapshots initially to avoid publishing
which merchant the user is paying. Cached signatures do not eliminate an expired
snapshot's revocation risk. Root key rotation requires a wallet-trusted update or
an independently specified cross-signature process; it is not merchant key rotation.

Initial governance: protected main branch, two maintainer reviews for key/origin
changes, protected release environment, release signing secret outside source,
offline root recovery procedures, and publicly recorded releases. This is centrally
governed and auditable, not decentralized consensus. Threshold signatures can be
considered later; this draft does not imply they already exist.

## Rotation, removal and emergency response

Normal key rotation requires fresh domain proof and an existing valid key signing
the exact replacement-record hash using registration-proof semantics. The new key
also proves possession. Overlap may preserve short-lived invoices, but no key's
expiration is extended implicitly. Removing an origin or revoking a key is recorded
explicitly. Never replace a key under the same kid.

For suspected key compromise, maintainers can immediately mark a key revoked or a
merchant suspended and issue a fresh snapshot without waiting for a signature
from the compromised key. Reactivation/replacement requires fresh domain proof,
two-person recovery review and a public decision record. Lost-key recovery does
not bypass those checks. Origin transfers need re-verification and review; old
bindings must not silently follow a new owner.

Revocations are append-only tombstones `{merchantId,kid,revokedAt,reason}` with
bounded machine-readable reason codes. Initial policy rejects all invoices under
a revoked key, even if issued before revocation. It cannot undo an already signed
or settled transaction. No promise of revocation faster than wallet refresh is made.
