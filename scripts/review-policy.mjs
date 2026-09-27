// Owner-authorized exception for September 27, 2026 (Asia/Kolkata).
export const temporaryReviewPolicy = Object.freeze({
 id: 'elviric-2026-09-27',
 repository: 'zucchini-wallet/open-zcash-merchant-payments',
 reviewer: 'elviric',
 startsAt: Date.parse('2026-09-26T18:30:00Z') / 1000,
 expiresAt: Date.parse('2026-09-27T18:30:00Z') / 1000,
});
export function reviewRequirement({repository, maintainers, now, policy}) {
 if (policy && repository === policy.repository && now >= policy.startsAt && now < policy.expiresAt)
  return {maintainers: [policy.reviewer], quorum: 1, policyId: policy.id};
 return {maintainers, quorum: 2};
}
export function validateApprovalLedger({approval, repository, maintainers, now, unchanged, policy}) {
 if (!Number.isSafeInteger(approval.verifiedAt) || approval.verifiedAt > now) throw Error('Invalid approval time');
 const rule = reviewRequirement({repository, maintainers, now: approval.verifiedAt, policy});
 if (approval.reviewPolicyId !== rule.policyId) throw Error('Approval policy mismatch');
 if (rule.policyId && !unchanged && now >= policy.expiresAt) throw Error('Temporary approval expired before first publication');
 if (!Array.isArray(approval.reviewers) || new Set(approval.reviewers).size < rule.quorum || approval.reviewers.some(r => !rule.maintainers.includes(r))) throw Error('Invalid approval ledger');
 if (rule.policyId && (!approval.author || approval.reviewers.includes(approval.author))) throw Error('Self-approval is not allowed');
}
