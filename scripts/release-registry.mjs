// Release from a clean trusted main checkout. No private material comes from Git or PR files.
// A local durable state directory allocates sequences and retains exact signed bytes.
import {readFile,readdir,mkdir,open,rename,unlink,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {resolveTxt} from 'node:dns/promises';
import {execFileSync} from 'node:child_process';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {strictJSON,verifyRegistry} from '../src/index.js';
import {signRegistry} from '../src/server.js';
import {validateTransition,hash} from './lifecycle.mjs';
const [configPath,ledgerPath,statePath]=process.argv.slice(2);
if(!statePath)throw Error('Usage: release-registry.mjs <operator-config.json> <operator-ledger.json> <durable-release-directory>');
const config=strictJSON(await readFile(configPath,'utf8')),ledger=strictJSON(await readFile(ledgerPath,'utf8'));
if(ledger.registryId!==config.registryId||ledger.version!==1)throw Error('Ledger registry mismatch');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
if(git('branch','--show-current')!=='main'||git('status','--porcelain','--untracked-files=all'))throw Error('Release requires clean main checkout');
const sourceCommit=git('rev-parse','HEAD'),stateDir=resolve(statePath);
if(!config.releaseKid||!config.releasePublicKey||!process.env.REGISTRY_SIGNING_KEY_FILE)throw Error('Provision the release public key and REGISTRY_SIGNING_KEY_FILE first');
const keyPath=resolve(process.env.REGISTRY_SIGNING_KEY_FILE),mode=(await stat(keyPath)).mode;
if((mode&0o077)!==0)throw Error('Signing key must be owner-only (0600)');
const key=createPrivateKey(await readFile(keyPath));
if(key.asymmetricKeyType!=='ed25519'||createPublicKey(key).export({format:'jwk'}).x!==config.releasePublicKey)throw Error('Release key does not match trusted public configuration');
await mkdir(stateDir,{recursive:true,mode:0o700});
const lock=await open(join(stateDir,'release.lock'),'wx',0o600);
async function durableWrite(path,bytes){const file=await open(path+'.tmp','w',0o600);try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}await rename(path+'.tmp',path);const dir=await open(stateDir,'r');try{await dir.sync();}finally{await dir.close();}}
try {
 let previous;try{previous=strictJSON(await readFile(join(stateDir,'state.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(previous){
  const verified=await verifyRegistry(previous.compact,{trust:{registryId:config.registryId,minimumSequence:1,roots:[{kid:config.releaseKid,publicKey:config.releasePublicKey}]},state:{accept:async()=>{}},now:previous.payload.issuedAt});
  const {checkpoint,...signedPayload}=verified;
  if(JSON.stringify(signedPayload)!==JSON.stringify(previous.payload))throw Error('Release state differs from its signed snapshot');
 }
 const now=Math.floor(Date.now()/1000),merchants=[];
 for(const file of (await readdir('merchants')).filter(f=>!f.startsWith('.')).sort()){
  if(!/^[a-z0-9][a-z0-9-]{0,63}\.json$/.test(file))throw Error('Invalid merchant filename');
  const bytes=await readFile(join('merchants',file)),record=strictJSON(bytes.toString('utf8')),approval=ledger.merchants[record.id];
  if(!approval||approval.recordSha256!==hash(bytes)||JSON.stringify(approval.record)!==JSON.stringify(record))throw Error('Unapproved merchant record: '+file);
  if(!Array.isArray(approval.reviewers)||new Set(approval.reviewers).size<2||approval.reviewers.some(r=>!config.maintainers.includes(r)))throw Error('Invalid approval ledger');
  // A never-published enrollment must be merged and released while its evidence is fresh.
  const unchanged=previous?.payload.merchants.some(m=>JSON.stringify(m)===JSON.stringify(record));
  if(!unchanged&&record.status==='active'&&(approval.proofs.length!==record.origins.length*record.paymentKeys.length||approval.proofs.some(p=>p.expiresAt<=now)))throw Error('Enrollment proof expired before first publication');
  if(!unchanged&&record.status==='active')for(const proof of approval.proofs){const records=await resolveTxt(proof.dnsName);if(!records.some(parts=>parts.join('')===proof.dnsValue))throw Error('Domain proof changed before publication');}
  merchants.push(record);
 }
 const revocations=strictJSON(await readFile('revocations.json','utf8'));
 const payload={version:1,registryId:config.registryId,sequence:(previous?.payload.sequence??0)+1,issuedAt:now,expiresAt:now+86400,sourceCommit,merchants,revocations};
 validateTransition(previous?.payload,payload);
 const compact=await signRegistry(payload,{kid:config.releaseKid,sign:async bytes=>new Uint8Array(sign(null,bytes,key))});
 await verifyRegistry(compact,{trust:{registryId:config.registryId,minimumSequence:payload.sequence,roots:[{kid:config.releaseKid,publicKey:config.releasePublicKey}]},state:{accept:async()=>{}},now});
 // Persist exact output before exposing a downloadable file. After interruption,
 // rerun advances the sequence; never sign different bytes for a recorded sequence.
 await durableWrite(join(stateDir,'state.json'),JSON.stringify({payload,compact})+'\n');
 await durableWrite(join(stateDir,`registry-${payload.sequence}.jws`),compact+'\n');
 await durableWrite(join(stateDir,'registry.jws'),compact+'\n');
 console.log(JSON.stringify({registryId:config.registryId,sequence:payload.sequence,sourceCommit,expiresAt:payload.expiresAt,file:join(stateDir,'registry.jws'),sha256:hash(compact+'\n')}));
} finally {await lock.close();await unlink(join(stateDir,'release.lock'));}
