# Signed registry publication host

Dedicated data publication worker, inside this protocol repository. The planned
public path is `https://api.zucchinifi.xyz/merchant-registry/v1/registry.jws`.
It serves operator-signed data; it does not receive customer invoices, keys or funds.
No production route, trust roots or secrets are provisioned by this configuration.

Configure `REGISTRY_TRUST` with the exact public wallet trust object and provision
a random `REGISTRY_PUBLISH_TOKEN` as a Worker secret (minimum 32 characters).
Add the narrowly scoped `api.zucchinifi.xyz/merchant-registry/*` zone route plus a
protected route for `/operator/publish` before deployment. Never replace the gateway
worker's custom-domain configuration. The public record store has one durable writer.
POST the exact output of `scripts/release-registry.mjs` to `/operator/publish` with
`Authorization: Bearer <token>`. Publishing verifies signatures, expiry and monotonic
checkpoints before atomically retaining the archive and latest snapshot. Same-sequence
content changes and rollbacks are rejected. The host cannot sign or renew a snapshot.

GET `.../health` fails after expiry; `.../archive/<sequence>.jws` retains immutable
signed history. The hourly cron emits a structured error when renewal is needed;
connect these logs to an operator alert destination before production activation.
This log is not an email/pager delivery mechanism. Schedule the external signer
at least every six hours and monitor successful publication. Root key custody and
that durable signing schedule remain provisioning requirements.

Test: `node --test tests/hosting.test.mjs`. Deploy using the reviewed Wrangler CLI.
No secrets belong in wrangler.jsonc or GitHub PR code. The host is not yet deployed.
