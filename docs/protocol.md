# Merchant payment authentication profile — draft 0.1

MUST/SHOULD describe the proposed profile, not existing ZIP 321 requirements.
Changes before a stable version may be incompatible. No new URI parameter or
wallet RPC method is declared standardized by this draft.

## 1. Standards and scope

- [ZIP 321](https://zips.z.cash/zip-0321): payment URI semantics.
- [RFC 7515](https://www.rfc-editor.org/rfc/rfc7515): JWS compact serialization.
- [RFC 8037](https://www.rfc-editor.org/rfc/rfc8037): EdDSA/Ed25519 JOSE use.
- [RFC 9864](https://www.rfc-editor.org/rfc/rfc9864): fully specified Ed25519 JOSE algorithm.
- [RFC 8032](https://www.rfc-editor.org/rfc/rfc8032): Ed25519.
- [RFC 4648](https://www.rfc-editor.org/rfc/rfc4648): base64url.

The first implementation profile supports ZEC on mainnet or testnet. Support for
all ZIP 321 features is not implied. A wallet MUST explicitly reject unsupported
payment features, including multiple recipients if not implemented; it MUST NOT
drop outputs, memos, or required parameters. Custom assets are outside this profile.
The proposed initial Zucchini merchant path requires shielded receiving capability.
Other wallets may support more address types with truthful privacy disclosure.

## 2. Invoice and signing bytes

The wire object is a compact JWS string. Its protected header has exactly:

```json
{"alg":"Ed25519","typ":"zcash-merchant-invoice+jws","kid":"payments-2026-01"}
```

Only Ed25519 keys are accepted. Reject other algorithms, `none`, unprotected
headers, remote key URLs, embedded trusted keys, extra header fields, and critical
extensions. Public key material comes only from the authenticated registry.

The signed payload is UTF-8 JSON matching the invoice schema. It contains version,
registryId, merchantId, kid, origin, network, invoiceId, issuedAt, expiresAt,
paymentUri, and optional challenge. `kid` MUST equal the protected header kid.

Signing input is ASCII `base64url(headerBytes) + "." + base64url(payloadBytes)`.
Use ordinary Ed25519 signing over those bytes, not Ed25519ph or a prehashed variant.
Signature is 64 bytes, raw public key 32 bytes. Encodings MUST be unpadded canonical
base64url; decode and re-encode equality is required. Verify the exact transported
bytes: do not sort JSON fields, normalize the URI, or reserialize before verification.
This avoids requiring custom JSON canonicalization.

After verifying, strictly parse the same payload. Reject duplicate JSON keys,
invalid UTF-8, unknown fields, wrong types, and excess size. Ordinary JSON.parse
alone does not detect duplicate keys. Maximum compact invoice: 32 KiB; maximum
decoded payment URI: 16 KiB. These are resource limits, not a promise every QR
code can carry the invoice.

All timestamps are safe-integer Unix seconds. Require issuedAt <= now + 60,
issuedAt < expiresAt, now < expiresAt, and a lifetime <= 900 seconds. Registry
and key expiry do not receive the clock-skew allowance. A clearly unreliable
device clock is an error. Merchant ID + invoice ID identifies one immutable
invoice. Reissuing different details requires a new invoice ID.

`paymentUri` is the sole source of recipients, amounts and memos. Parse it once
after signature validation and use that parsed representation for both review
and transaction creation. Require explicit positive amounts for every output,
validate each address checksum/network, and use integer zatoshis without floating
point conversion. Reject ambiguous or duplicate URI parameters and unsupported
required parameters according to ZIP 321. Labels/messages are merchant-authored
text, not independently verified claims. Render them as bounded plain text.

## 3. Registry trust and origin checks

Wallets choose and pin a registry ID and release public key through their own
trusted distribution. An invoice cannot choose a new trust root or cause arbitrary
key downloads. Verify a fresh registry snapshot as defined in registry.md. Then
find the exact merchant ID and kid, check the key's network, validity, origin
membership, merchant status, and revocation before checking the invoice signature.

Production origins are serialized HTTPS origins with ASCII DNS hostnames, no
credentials, path, query, fragment, wildcard, IP address or non-default port.
Subdomains are distinct. Canonical input must equal the URL implementation's
serialized origin. Unicode domain input is converted before registration; wallets
show ASCII/punycode where needed to avoid misleading lookalikes. Dev localhost
uses a separate explicit developer mode and registry, never a production badge.

Direct browser requests MUST match browser-derived top-level origin and document
identity. Reject cross-origin iframes in the initial bridge. Never trust the
origin claimed by page JavaScript. Cancel unsigned pending approval on navigation,
disconnect, lock, account/network change, or permission revocation.

QR/file imports have no browser-origin proof. They can authenticate the invoice's
issuer but MUST NOT claim that the displayed website or scanning source was
authenticated. Delegated checkout origins require explicit registration; they
cannot be inferred from redirects or a common parent domain.

## 4. Replay and approval

Interactive bridges SHOULD request a 32-byte random wallet challenge. Bind it to
origin, current document, network, expiration and a single pending request. The
backend signs it; wallet checks it. Portable QR invoices may omit the challenge.
Challenge-free transport MUST NOT be presented as session-bound.

Wallets persist invoice state keyed by registryId/merchantId/invoiceId. Reserve
atomically before signing; record the signed payload digest and proposal/transaction
reference. Reject concurrent attempts and re-use with a different digest. Reopening
a submitted invoice shows its existing transaction rather than creating a payment.
After a crash or uncertain broadcast, recover the original transaction and state;
do not silently create a replacement payment. Challenges and local records cannot
prevent the same portable invoice being paid by two different wallets. Merchant
receipt reconciliation must handle duplicate payments explicitly.

Approval UI shows verified issuer origin, recipient(s), ZEC amount(s), memo when
present, selected receiver/privacy, network and exact fee/total. Details may be
progressively disclosed, but all outgoing outputs and costs must be inspectable.
Website text/HTML never supplies wallet UI. Connection is not payment permission.

The wallet constructs its own proposal and binds approval to its immutable
identifier/digest and the invoice digest. All non-change outputs and memo bytes
must match the signed URI; change is derived by the wallet. Recheck expiry,
revocation and proposal identity immediately before signing. If payment terms or
fee change, request a new review. Once signed, preserve recovery state even if
the user closes the window. Never expose seeds, spending keys or viewing keys to
the website or registry.

## 5. Transports and downgrade behavior

The SDK can deliver the compact invoice through a wallet bridge or a downloadable
file. Proposed file suffix `.zcash-invoice` is a convention pending adoption.
The URI can be offered separately as an ordinary ZIP 321 link/QR for older wallets.
It is not independently authenticated on those wallets.

A verification-aware wallet MUST NOT strip a failed signature, missing registry,
expired key, or unsupported signed format and continue as a plain payment. Show a
clear error. Do not silently retry a different RPC or fallback method after a
payment request, because the first may already have been signed or broadcast.

HTTPS invoice-link discovery, MIME registration, and custom ZIP 321 parameters
remain future interoperability proposals. Do not ship an arbitrary URL fetcher
before defining redirect, SSRF, size, privacy and origin rules. For QR capacity,
start with plain URI fallback and signed invoice file/bridge; do not pretend a
large JWS is universally scannable.

## 6. Security limits

A malicious script on a valid origin can submit requests. Signed invoices prevent
it altering backend-authorized payment fields only if the backend derives them
from its own order database. Signing arbitrary client-provided URIs defeats this
protection. A compromised merchant backend/key can authorize bad payments. Domain
ownership, registry review and valid signatures do not prove honest commerce.

A compromised registry release key can replace merchant bindings; separate
release governance, offline recovery and wallet-distributed root updates are
necessary. Freshness bounds offline revocation delay, not instant revocation.
No registry or wallet can guarantee fulfillment or prevent users paying an
unsigned malicious URI through another route.

Merchant servers confirm receipt through their own Zcash receiving wallet and
confirmation policy. Frontend callbacks and transaction IDs are hints only; they
are not proof that the merchant received the expected shielded payment. No customer
addresses, invoices, memos or transaction histories belong in the public registry.
