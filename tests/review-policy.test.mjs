import test from 'node:test';
import assert from 'node:assert/strict';
import {temporaryReviewPolicy as policy, validateApprovalLedger} from '../scripts/review-policy.mjs';
import {validateReviewEvidence} from '../scripts/lifecycle.mjs';
const sourceCommit='a'.repeat(40), repository=policy.repository;
const pull={head:{sha:sourceCommit},base:{ref:'main',repo:{full_name:repository}},state:'open',draft:false,user:{login:'merchant'}};
const review=(login,state='APPROVED')=>({user:{login},state,commit_id:sourceCommit,submitted_at:'2026-09-27T10:00:00Z'});
const options={pull,reviews:[review('elviric')],repository,sourceCommit,maintainers:['elviric','second'],policy,now:policy.startsAt};
test('sole reviewer exception has exact timezone boundaries and preserves review safeguards',()=>{
 assert.deepEqual(validateReviewEvidence(options),['elviric']);
 for(const now of [policy.startsAt-1,policy.expiresAt])assert.throws(()=>validateReviewEvidence({...options,now}));
 assert.throws(()=>validateReviewEvidence({...options,reviews:[review('second')]}));
 assert.throws(()=>validateReviewEvidence({...options,pull:{...pull,user:{login:'elviric'}}}));
 assert.throws(()=>validateReviewEvidence({...options,reviews:[{...review('elviric'),commit_id:'b'.repeat(40)}]}));
 for(const state of ['CHANGES_REQUESTED','DISMISSED'])assert.throws(()=>validateReviewEvidence({...options,reviews:[review('elviric',state)]}));
 assert.deepEqual(validateReviewEvidence({...options,now:policy.expiresAt,reviews:[review('elviric'),review('second')]}),['elviric','second']);
});
test('exception evidence expires for first publication but permits unchanged signed snapshot refresh',()=>{
 const approval={verifiedAt:policy.startsAt,reviewers:['elviric'],author:'merchant',reviewPolicyId:policy.id};
 const args={approval,repository,maintainers:['elviric','second'],now:policy.expiresAt-1,unchanged:false,policy};
 validateApprovalLedger(args);
 assert.throws(()=>validateApprovalLedger({...args,now:policy.expiresAt}),/expired/);
 validateApprovalLedger({...args,now:policy.expiresAt,unchanged:true});
 for(const patch of [{author:'elviric'},{reviewers:['second']},{reviewPolicyId:'fake'},{verifiedAt:policy.expiresAt}])assert.throws(()=>validateApprovalLedger({...args,approval:{...approval,...patch}}));
});
