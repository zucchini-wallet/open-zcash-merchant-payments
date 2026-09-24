## Change type

Registration / normal key rotation / origin update / suspension / recovery / protocol change

## Merchant record

- Merchant ID:
- Exact HTTPS origins:
- New public invoice-key IDs:
- Removed origins or retired key IDs (add revocation tombstones where applicable):
- Public recovery/incident decision, if applicable:

## Proof and review

Do not include private keys, wallet seeds, viewing keys or customer payment data.
After the record is final, request operator-issued challenges for this PR head.
Return signatures as public comments without changing the challenged commit.
Changing the head invalidates current-head review and challenge evidence.

- [ ] JSON record and tests pass.
- [ ] I understand domain proof is control at verification time, not business endorsement.
- [ ] For rotation, the old valid key and the new key both prove authorization/possession,
      or a documented operator recovery process is explicitly requested.
- [ ] Two configured maintainers reviewed this exact head; operator approval and
      publication are separate from a green unprivileged CI check.

See docs/operator-lifecycle.md. Production registration is not active until
operator identities, trust roots, release storage, hosting and monitoring are provisioned.
