import {cp,mkdir,rm} from 'node:fs/promises';
const out=new URL('../dist/',import.meta.url);
await rm(out,{recursive:true,force:true});await cp(new URL('../site/',import.meta.url),out,{recursive:true});
await mkdir(new URL('protocol/',out));
for(const name of ['validation.js','encoding.js'])await cp(new URL('../../src/'+name,import.meta.url),new URL('protocol/'+name,out));
console.log('Built merchant registration preview (no enrollment/signing backend).');
