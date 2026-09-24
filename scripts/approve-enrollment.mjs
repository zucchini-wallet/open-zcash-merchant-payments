// This command fetches PR DATA only. Never executes a PR checkout or accepts PR CI as authority.
// Run from a trusted checkout with operator-owned config/evidence/ledger directories.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,rename,mkdir,open} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {resolveTxt} from 'node:dns/promises';
import {strictJSON,validateMerchantRecord} from '../src/index.js';
import {validateReviewEvidence,verifyEnrollment,verifyRotationAuthorization,hash} from './lifecycle.mjs';
const [configPath,bundlePath,ledgerPath]=process.argv.slice(2);
if(!ledgerPath)throw Error('Usage: approve-enrollment.mjs <operator-config.json> <proof-bundle.json> <operator-ledger.json>');
const config=strictJSON(await readFile(configPath,'utf8')), bundle=strictJSON(await readFile(bundlePath,'utf8'));
if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository)||!Number.isSafeInteger(bundle.pullNumber)||bundle.pullNumber<=0)throw Error('Invalid repository or PR');
const api=path=>strictJSON(execFileSync('gh',['api',path],{encoding:'utf8',maxBuffer:8*1024*1024}));
const prefix=`repos/${config.repository}`;
const pull=api(`${prefix}/pulls/${bundle.pullNumber}`),sourceCommit=pull.head.sha;
let reviews=[];for(let page=1;;page++){const part=api(`${prefix}/pulls/${bundle.pullNumber}/reviews?per_page=100&page=${page}`);reviews.push(...part);if(part.length<100)break;if(page>=100)throw Error('Too many reviews');}
const reviewers=validateReviewEvidence({pull,reviews,repository:config.repository,sourceCommit,maintainers:config.maintainers});
if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(bundle.merchantId))throw Error('Invalid merchant ID');
const file=api(`${prefix}/contents/merchants/${bundle.merchantId}.json?ref=${sourceCommit}`);
if(file.type!=='file'||file.encoding!=='base64'||file.size>65536)throw Error('Invalid record file');
const recordBytes=Buffer.from(file.content,'base64'),record=strictJSON(recordBytes.toString('utf8'));validateMerchantRecord(record);
if(record.id!==bundle.merchantId)throw Error('Record ID mismatch');
const ledgerFile=resolve(ledgerPath);await mkdir(dirname(ledgerFile),{recursive:true,mode:0o700});
const lock=await open(ledgerFile+'.lock','wx',0o600);
try {
 let ledger;try{ledger=strictJSON(await readFile(ledgerFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;ledger={version:1,registryId:config.registryId,merchants:{}};}
 if(ledger.version!==1||ledger.registryId!==config.registryId)throw Error('Ledger registry mismatch');
 const prior=ledger.merchants[record.id];
 const previous=prior?.record;
 const revokedKids=[...new Set([...(prior?.revokedKids??[]),...(previous?.paymentKeys.filter(k=>!record.paymentKeys.some(n=>n.kid===k.kid)).map(k=>k.kid)??[])])];
 for(const key of record.paymentKeys)if(revokedKids.includes(key.kid))throw Error('Retired key ID cannot return');
 if(previous)for(const key of record.paymentKeys){const old=previous.paymentKeys.find(k=>k.kid===key.kid);if(old&&JSON.stringify(old)!==JSON.stringify(key))throw Error('Rotate to a new key ID');}
 const now=Math.floor(Date.now()/1000),checks=[];
 const currentRevocations=strictJSON(await readFile(new URL('../revocations.json',import.meta.url),'utf8'));
 const revokedForSigning=[...new Set([...(prior?.revokedKids??[]),...currentRevocations.filter(r=>r.merchantId===record.id).map(r=>r.kid)])];
 const load=async path=>strictJSON(await readFile(resolve(dirname(bundlePath),path),'utf8'));
 // Require proof for every exact origin/key pair on a new or modified active record.
 if(record.status==='active')for(const origin of record.origins)for(const key of record.paymentKeys){
  const item=bundle.proofs?.find(p=>p.origin===origin&&p.kid===key.kid);if(!item)throw Error('Missing origin/key proof');
  const trustedChallenge=await load(item.challenge);
  if(trustedChallenge.proof.registryId!==config.registryId)throw Error('Challenge registry mismatch');
  checks.push(await verifyEnrollment({recordBytes,compact:(await readFile(resolve(dirname(bundlePath),item.signature),'utf8')).trim(),trustedChallenge,repository:config.repository,sourceCommit,resolveTxt,now}));
 }
 const mode=bundle.mode??'normal';if(!['normal','recovery','suspend'].includes(mode))throw Error('Unknown operator mode');
 if(record.status==='suspended'&&mode!=='suspend')throw Error('Suspension requires explicit incident mode');
 if(record.status==='active'&&mode==='suspend')throw Error('Suspension cannot activate a merchant');
 if(mode!=='normal'&&!(typeof bundle.decision==='string'&&bundle.decision.startsWith(`https://github.com/${config.repository}/`)))throw Error('Recovery/suspension requires public decision URL');
 if(previous&&record.status==='active'&&mode==='normal'){
  if(!bundle.rotation)throw Error('Existing-key approval required; lost keys use reviewed recovery mode');
  const envelope=await load(bundle.rotation.challenge);
  if(envelope.repository!==config.repository||envelope.sourceCommit!==sourceCommit||envelope.proof.registryId!==config.registryId)throw Error('Rotation challenge mismatch');
  await verifyRotationAuthorization({previous,recordBytes,compact:(await readFile(resolve(dirname(bundlePath),bundle.rotation.signature),'utf8')).trim(),expected:envelope.proof,revokedKids:revokedForSigning,now});
 }
 // Re-read immediately before acceptance to detect a head change during DNS/verification.
 if(api(`${prefix}/pulls/${bundle.pullNumber}`).head.sha!==sourceCommit)throw Error('PR changed during verification');
 ledger.merchants[record.id]={record,recordSha256:hash(recordBytes),sourceCommit,pullNumber:bundle.pullNumber,reviewers,verifiedAt:now,proofs:checks,revokedKids,mode,...(bundle.decision?{decision:bundle.decision}:{})};
 await writeFile(ledgerFile+'.tmp',JSON.stringify(ledger,null,2)+'\n',{mode:0o600});await rename(ledgerFile+'.tmp',ledgerFile);
 console.log(JSON.stringify({accepted:record.id,sourceCommit,reviewers,recordSha256:hash(recordBytes)}));
} finally {await lock.close();const {unlink}=await import('node:fs/promises');await unlink(ledgerFile+'.lock');}
