# Merchant integration

The independent package is `@zucchinifi/merchant-payments`. Zucchini's dApp SDK
adds experimental `/merchant` (browser) and `/merchant/server` entry points. They
are implemented locally, not yet published to npm. The local SDK uses a pinned
vendor tarball; replace that dependency with the exact published version before
publishing the SDK. The method names below are a draft interface, not a ZIP.

## Backend

Use `signInvoice(invoice, {sign, validateAddress})`. Resolve payment amount,
recipient, memo and network from your authenticated server-side order database.
Accept only the order ID and optional wallet challenge from the browser. Validate
that the challenge origin/network matches your checkout context, bound its expiry,
then include it in the signed invoice. Never sign a browser-supplied arbitrary URI.

`sign(bytes)` is an asynchronous callback for Ed25519 signing. Store the invoice
key in the merchant's protected backend/KMS. It is separate from Zcash spending
keys. The address validator must use a trusted Zcash decoder; examples/checkout
accepts only one test fixture and is not a production address validator.

## Browser / wallet handshake

1. Connect to the wallet through its existing user-approved connection flow.
2. `zcash_getMerchantPaymentCapabilities` returns
   `{versions:[1],networks:["testnet"],features:["single-shielded-zec"]}` only when
   the wallet has implemented validation, approval and durable recovery.
3. `zcash_createMerchantPaymentChallenge({version:1,network})` returns
   `{challenge,origin,network,expiresAt}`. The wallet derives origin from browser
   metadata and stores the challenge against the originating document/session.
4. Send the challenge to the merchant backend with your order ID. It returns JWS.
5. `zcash_requestMerchantPayment({version:1,invoice})` submits that exact JWS.
   The wallet verifies, reviews, gets user approval, signs and broadcasts.
6. Success returns `{txid,invoiceDigest}`. The merchant independently verifies the
   receipt through its receiving wallet. Errors and uncertain outcomes must not
   trigger an automatic retry or plain-URI/legacy-send fallback.

The browser convenience wrapper is `createMerchantPaymentClient(provider)` with
`capabilities()`, `challenge(network)` and `requestPayment(invoice)`. The current
extension does not yet advertise these capabilities. Do not infer readiness from
installation or ordinary Zcash sending support.

## Wallet implementation

Pin registry roots in trusted wallet configuration, not merchant input. Store
checkpoints through an atomic durable adapter. `assertCheckpoint(previous,next)`
can be called inside that storage transaction. Verify snapshots, then invoices;
revalidate against the latest snapshot before signing. Bind every approval to the
parsed terms, invoice digest and exact transaction proposal. Keep atomic invoice
reservations and recover signed transactions after interruptions. Duplicate-payment
prevention is a wallet responsibility, not guaranteed by invoice verification.

For native QR/imports, pass `context:{kind:"import"}`; these only authenticate the
issuer. Session-bound challenge invoices require browser context and cannot be
replayed as portable imports. No unsigned fallback on verification failure.
