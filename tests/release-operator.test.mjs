import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,mkdir,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {generateKeyPairSync} from 'node:crypto';
import {verifyRegistry,assertCheckpoint} from '../src/index.js';
const script=resolve(new URL('../scripts/release-registry.mjs',import.meta.url).pathname);
test('operator release persists increasing signed snapshots, rejects unsafe keys, dirty source and concurrent writers',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'merchant-release-test-'));
 try {
  const repo=join(dir,'repo'),state=join(dir,'releases');await mkdir(repo);await mkdir(join(repo,'merchants'));await writeFile(join(repo,'merchants/.gitkeep'),'');await writeFile(join(repo,'revocations.json'),'[]\n');
  const git=(...args)=>execFileSync('git',args,{cwd:repo,stdio:'pipe'});
  git('init','--initial-branch=main');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Fixture empty registry');
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');const keyPath=join(dir,'key.pem');await writeFile(keyPath,privateKey.export({format:'pem',type:'pkcs8'}),{mode:0o600});
  const config={repository:'example/registry',registryId:'operator-test',maintainers:['alice','bob'],releaseKid:'operator-1',releasePublicKey:publicKey.export({format:'jwk'}).x};
  const configPath=join(dir,'config.json'),ledgerPath=join(dir,'ledger.json');await writeFile(configPath,JSON.stringify(config));await writeFile(ledgerPath,JSON.stringify({version:1,registryId:config.registryId,merchants:{}}));
  const release=()=>execFileSync(process.execPath,[script,configPath,ledgerPath,state],{cwd:repo,env:{...process.env,REGISTRY_SIGNING_KEY_FILE:keyPath},encoding:'utf8',stdio:'pipe'});
  const first=JSON.parse(release());assert.equal(first.sequence,1);
  let checkpoint;const options={trust:{registryId:config.registryId,minimumSequence:1,roots:[{kid:config.releaseKid,publicKey:config.releasePublicKey}]},state:{accept:async next=>{assertCheckpoint(checkpoint,next);checkpoint=next;}}};
  await verifyRegistry((await readFile(first.file,'utf8')).trim(),options);
  const second=JSON.parse(release());assert.equal(second.sequence,2);await verifyRegistry((await readFile(second.file,'utf8')).trim(),options);
  await assert.rejects(verifyRegistry((await readFile(join(state,'registry-1.jws'),'utf8')).trim(),options));
  await writeFile(join(state,'release.lock'),'');assert.throws(release);await rm(join(state,'release.lock'));
  await chmod(keyPath,0o644);assert.throws(release);await chmod(keyPath,0o600);
  await writeFile(join(repo,'dirty.txt'),'unreviewed');assert.throws(release);await rm(join(repo,'dirty.txt'));
  await writeFile(join(repo,'merchants/unapproved.json'),'{}');git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Unapproved record');assert.throws(release);
  assert.equal(JSON.parse(await readFile(join(state,'state.json'),'utf8')).payload.sequence,2);
 } finally {await rm(dir,{recursive:true,force:true});}
});
