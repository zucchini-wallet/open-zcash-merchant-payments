import {merchant} from './protocol/validation.js';
const form=document.querySelector('#record'),result=document.querySelector('#result');
form.addEventListener('submit',event=>{
 event.preventDefault();
 try{
  const data=new FormData(form);
  const record={version:1,id:data.get('id'),name:data.get('name'),origins:[data.get('origin')],status:'active',paymentKeys:[{kid:data.get('kid'),algorithm:'Ed25519',publicKey:data.get('publicKey'),networks:[data.get('network')],notBefore:Date.parse(data.get('from')+'T00:00:00Z')/1000,expiresAt:Date.parse(data.get('until')+'T00:00:00Z')/1000}]};
  merchant(record);
  if(record.paymentKeys[0].expiresAt<=Date.now()/1000)throw Error('Choose a future expiry date.');
  const blob=new Blob([JSON.stringify(record,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=record.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  result.textContent='Draft downloaded. Nothing has been submitted or activated. Keep this file for the ownership-proof and review steps when enrollment opens.';
 }catch{result.textContent='Check the domain, public key, merchant ID and validity dates. Use an HTTPS origin without a path or trailing slash.';}
});
