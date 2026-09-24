import test from 'node:test';
import assert from 'node:assert/strict';
import { challengeEnvelope, hash, verifyEnrollment, validateTransition, verifyRotationAuthorization, validateReviewEvidence } from '../scripts/lifecycle.mjs';
import { signRegistrationProof } from '../src/server.js';
import * as f from './fixtures.mjs';
const repository='zucchini-wallet/open-zcash-merchant-payments', sourceCommit='a'.repeat(40);
const bytes=Buffer.from(JSON.stringify(f.record));
const proof={version:1,registryId:'test-registry',merchantId:f.record.id,kid:'merchant-1',origin:f.record.origins[0],recordSha256:hash(bytes),challenge:Buffer.alloc(32,3).toString('base64url'),issuedAt:f.now,expiresAt:f.now+1000};
const next=() => structuredClone({...f.registryPayload,sequence:2});
test('enrollment binds trusted repository, commit, exact bytes, DNS and key possession',async()=>{
 const compact=await signRegistrationProof(proof,{sign:f.merchantKey.sign});
 const options={recordBytes:bytes,compact,trustedChallenge:challengeEnvelope(proof,{repository,sourceCommit}),repository,sourceCommit,now:f.now,resolveTxt:async()=>[[`v=1; registry=${proof.registryId}; merchant=${proof.merchantId}; record=${proof.recordSha256}; challenge=${proof.challenge}`]]};
 assert.equal((await verifyEnrollment(options)).recordSha256,hash(bytes));
 await assert.rejects(verifyEnrollment({...options,sourceCommit:'b'.repeat(40)}),/source mismatch/);
 await assert.rejects(verifyEnrollment({...options,recordBytes:Buffer.from(JSON.stringify(f.record)+'\n')}));
 await assert.rejects(verifyEnrollment({...options,resolveTxt:async()=>[['wrong']]}),/TXT proof mismatch/);
 await assert.rejects(verifyEnrollment({...options,now:f.now+1001}));
});
test('releases are monotonic and keys must rotate without rewriting existing kids',()=>{
 validateTransition(f.registryPayload,next());
 for(const mutate of [n=>n.sequence=1,n=>n.registryId='other',n=>n.merchants=[],n=>n.merchants[0].paymentKeys[0].publicKey=f.root.publicKey,n=>n.merchants[0].paymentKeys[0].expiresAt++]){const n=next();mutate(n);assert.throws(()=>validateTransition(f.registryPayload,n));}
 const added={...f.record.paymentKeys[0],kid:'merchant-2',publicKey:f.root.publicKey};
 const n=next();n.merchants[0].paymentKeys=[added];assert.throws(()=>validateTransition(f.registryPayload,n),/revocation/);
 n.revocations=[{merchantId:f.record.id,kid:'merchant-1',revokedAt:f.now,reason:'retired'}];validateTransition(f.registryPayload,n);
 const later=structuredClone({...n,sequence:3,revocations:[]});assert.throws(()=>validateTransition(n,later),/append-only/);
 later.revocations=n.revocations;later.merchants[0].paymentKeys.push({...added,kid:'merchant-1'});assert.throws(()=>validateTransition(n,later),/reintroduced/);
});
test('replacement needs live unrevoked previous-key signature on replacement hash',async()=>{
 const replacement={...f.record,paymentKeys:[{...f.record.paymentKeys[0],kid:'new-key',publicKey:f.root.publicKey}]};const recordBytes=Buffer.from(JSON.stringify(replacement));
 const expected={...proof,recordSha256:hash(recordBytes)};const compact=await signRegistrationProof(expected,{sign:f.merchantKey.sign});
 const options={previous:f.record,recordBytes,compact,expected,now:f.now};
 await verifyRotationAuthorization(options);
 await assert.rejects(verifyRotationAuthorization({...options,revokedKids:['merchant-1']}),/previous key/);
 await assert.rejects(verifyRotationAuthorization({...options,compact:await signRegistrationProof(expected,{sign:f.root.sign})}));
 await assert.rejects(verifyRotationAuthorization({...options,recordBytes:bytes}));
});
test('review gate requires two current-head maintainers and rejects stale, dismissed, author and requested-change approvals',()=>{
 const pull={head:{sha:sourceCommit},base:{ref:'main',repo:{full_name:repository}},state:'open',draft:false,user:{login:'author'}};
 const review=(login,state='APPROVED',commit_id=sourceCommit,submitted_at='2026-09-24T00:00:00Z')=>({user:{login},state,commit_id,submitted_at});
 const options={pull,reviews:[review('alice'),review('bob')],repository,sourceCommit,maintainers:['alice','bob','carol','author']};
 assert.deepEqual(validateReviewEvidence(options),['alice','bob']);
 for(const reviews of [[review('alice'),review('alice')],[review('alice'),review('bob','APPROVED','b'.repeat(40))],[review('alice'),review('author')],[...options.reviews,review('alice','DISMISSED',sourceCommit,'2026-09-24T01:00:00Z')],[...options.reviews,review('carol','CHANGES_REQUESTED')]])assert.throws(()=>validateReviewEvidence({...options,reviews}));
 assert.throws(()=>validateReviewEvidence({...options,pull:{...pull,head:{sha:'b'.repeat(40)}}}));
});
