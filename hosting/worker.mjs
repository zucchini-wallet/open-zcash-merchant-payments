import {verifyRegistry,assertCheckpoint} from '../src/index.js';
const headers={'Content-Type':'application/jose','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function authorized(request,secret){
 if(typeof secret!=='string'||secret.length<32)return false;
 const supplied=request.headers.get('authorization')??'';
 if(supplied.length>1024)return false;
 const digest=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const [a,b]=await Promise.all([digest(supplied),digest('Bearer '+secret)]);let different=0;for(let i=0;i<a.length;i++)different|=a[i]^b[i];return different===0;
}
async function body(request){
 if(!request.body)throw Error('Empty snapshot');
 const reader=request.body.getReader(),parts=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>4*1024*1024){await reader.cancel();throw Error('Snapshot too large');}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes).trim();
}
/** Sole publication writer. Signing authority remains with the external release operator. */
export class RegistryStore {
 constructor(state,env){this.storage=state.storage;this.env=env;}
 async fetch(request){
  let trust;try{trust=JSON.parse(this.env.REGISTRY_TRUST);}catch{return json({error:'registry_not_provisioned'},503);}
  const path=new URL(request.url).pathname,now=Math.floor(Date.now()/1000);
  if(path==='/operator/publish'&&request.method==='POST'){
   if(!await authorized(request,this.env.REGISTRY_PUBLISH_TOKEN))return json({error:'unauthorized'},401);
   try{
    const compact=await body(request);
    const registry=await verifyRegistry(compact,{trust,now,state:{accept:async()=>{}}});
    // Atomic checkpoint + immutable archive + latest. Never accept same sequence/different bytes.
    await this.storage.transaction(async store=>{
     const previous=await store.get('latest');
     assertCheckpoint(previous?.checkpoint,registry.checkpoint);
     if(previous?.checkpoint.sequence===registry.sequence&&previous.compact!==compact)throw Error('Conflicting snapshot');
     const record={compact,checkpoint:registry.checkpoint,expiresAt:registry.expiresAt,issuedAt:registry.issuedAt};
     await store.put(`archive:${registry.sequence}`,record);await store.put('latest',record);
    });
    return json({sequence:registry.sequence,expiresAt:registry.expiresAt});
   }catch{return json({error:'invalid_or_rollback_snapshot'},400);}
  }
  if(request.method!=='GET'&&request.method!=='HEAD')return json({error:'method_not_allowed'},405);
  const archive=/^\/merchant-registry\/v1\/archive\/([1-9][0-9]{0,14})\.jws$/.exec(path);
  if(path!=='/merchant-registry/v1/registry.jws'&&path!=='/merchant-registry/v1/health'&&!archive)return json({error:'not_found'},404);
  const record=await this.storage.get(archive?`archive:${archive[1]}`:'latest');
  if(!record)return json({error:'registry_not_published'},503);
  if(path.endsWith('/health'))return json({ready:record.expiresAt>now,sequence:record.checkpoint.sequence,expiresAt:record.expiresAt},record.expiresAt>now?200:503);
  if(!archive&&record.expiresAt<=now)return json({error:'registry_expired'},503);
  return new Response(request.method==='HEAD'?null:record.compact,{headers});
 }
}
export default {
 fetch(request,env){return env.REGISTRY.get(env.REGISTRY.idFromName('production-v1')).fetch(request);},
 async scheduled(_event,env,ctx){
  ctx.waitUntil((async()=>{const response=await env.REGISTRY.get(env.REGISTRY.idFromName('production-v1')).fetch(new Request('https://internal/merchant-registry/v1/health'));const health=await response.json();if(!response.ok||health.expiresAt-Math.floor(Date.now()/1000)<21600)console.error(JSON.stringify({event:'merchant_registry_refresh_required',sequence:health.sequence??null,expiresAt:health.expiresAt??null}));})());
 }
};
