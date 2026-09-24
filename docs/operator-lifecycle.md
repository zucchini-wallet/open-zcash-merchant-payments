# Operator lifecycle

These are executable operator tools, not an active production registry. Public
registration is a PR in this repository. No registration web service, X account,
wallet seed, viewing key or customer payment history is required.

## Trust boundary and bootstrap

Run tools from a reviewed trusted checkout, never the merchant's PR branch.
Keep operator config, issued challenges, proof bundles, approval ledger and durable
release state outside the checkout. Back up the ledger and release state together.
A merchant cannot approve itself by putting a JSON approval file in its PR.
The signing key is an owner-only PEM file, optionally supplied by a protected
runtime; do not store it in the repository or share it with merchants.

Operator config fields: `repository`, `registryId`, `maintainers` (at least two
independent GitHub reviewers), `releaseKid`, `releasePublicKey`. Establish these
with named operators before enrollment. Production wallet trust needs the same
registry ID/public release key and an explicit minimum accepted sequence. These
tools do not change wallet trust or enable signed payments in 0.5.2.

## Register or update

1. Merchant generates an Ed25519 invoice key on its backend and opens a PR with
   `merchants/<id>.json`. Only public data belongs in the record.
2. Operator downloads the exact record bytes from the PR head. Run
   `create-challenge.mjs` with record, registry ID, exact origin, key ID,
   repository and PR head SHA. Store the returned envelope in trusted operator
   storage. Do this for every origin/key pair. Give the `proof` payload to the
   merchant; its repository/commit envelope stays under operator control.
3. Merchant signs `proof` with `signRegistrationProof` and publishes the DNS TXT
   described in registry.md. Return the public signature without changing the
   challenged PR head (for example as a PR comment). Any head change requires
   reissuing challenges. Do not commit secret keys to demonstrate ownership.
4. Two configured maintainers other than the PR author approve the current head.
   An outstanding changes-request blocks acceptance. GitHub branch protection
   remains desirable but is not assumed by this tool.
5. Create an operator-owned proof bundle:
   `{pullNumber, merchantId, proofs:[{origin,kid,challenge,signature}], mode}`.
   File paths are relative to the bundle. Run
   `node scripts/approve-enrollment.mjs config.json bundle.json ledger.json`.
   It fetches PR metadata/reviews/record through `gh api`, checks current-head
   approvals, exact bytes, challenge binding, key possession and live DNS, then
   rechecks the head before atomically saving the accepted record.
6. Merge only the reviewed record. Publish its first snapshot before the proof
   expires. A changed record or stale proof cannot be published by the release tool.

GitHub comments and reviews are not executed. No `pull_request_target` workflow
checks out PR scripts with signing authority. The operator's GitHub token needs
read access only for verification; merges remain normal repository operations.

## Rotation, loss and revocation

For a normal update, also supply `rotation:{challenge,signature}`: an old valid,
unrevoked invoice key signs the replacement record hash using registration-proof
semantics. The operator issues this proof payload with the old key ID/origin,
new record SHA-256 and new nonce; `challengeEnvelope` binds it to the same head.
Every replacement key also proves possession. Never rewrite an existing key ID,
including extending its validity. Add a new ID and overlap if needed.

Lost/compromised old keys require operator-selected `mode:"recovery"`, fresh DNS
and new-key proof, two current-head reviewers, and `decision` linking the public
incident decision in this repository. This is an explicit human recovery trust
assumption; it does not prove possession of a lost key.

For emergencies use `mode:"suspend"`, a suspended record, two reviewers and a
public decision URL. No compromised-key signature is required. Add affected keys
to root `revocations.json` with reason and timestamp; it is append-only. Retain
merchant records as tombstones. Release validation rejects removed merchants,
changed old key IDs, removed revocations, and retired IDs returning later.
Origin changes always require a new record and full proof. Old-domain ownership
must never silently authorize a new domain controller.

## Snapshot release and operation

From clean main, run:

```
REGISTRY_SIGNING_KEY_FILE=/private/operator/release.pem node scripts/release-registry.mjs /private/operator/config.json /private/operator/ledger.json /private/operator/releases
```

The command requires matching key/public config, exact approved records, fresh
first-publication evidence, valid transitions and increasing sequence. It locks
local durable state, signs and verifies the snapshot, fsyncs exact signed bytes
before exposing `registry.jws`, and retains numbered output. Run only one release
operator against one durable state directory; do not clone state into concurrent
writers. Back up before migrating. A stale lock after a crash requires checking
that no release process is running, then removing the lock. Never reset the
sequence. Lost state requires recovery from authenticated retained snapshots.

Publish the exact output to a fixed HTTPS URL and immutable numbered archive.
Schedule refresh at least every six hours (snapshot validity is 24 hours), alert
on failure/approaching expiry, and issue an immediate snapshot for revocations.
The hosting destination, scheduler, monitoring, root-key custody and two operator
identities are provisioning gates, not implied by these scripts. No production
schedule is installed while those are unset. Cache failure must fail closed in
wallets, never silently enable unsigned merchant payments.

Do not roll back to an older signed file to undo a mistake. Issue a higher
sequence with corrected records/tombstones. Root rotation needs a wallet trust
update; it is different from merchant invoice-key rotation. Independently review
these operational tools before production custody or paid checkout rollout.
