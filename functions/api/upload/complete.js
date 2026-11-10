import {authenticate,ensureBucket,ownKey,json,failure} from '../../_lib/security.js';
export async function onRequestPost({request,env}){try{
  const user=await authenticate(request,env),bucket=ensureBucket(env),{key,uploadId,parts}=await request.json();
  if(!ownKey(key,user.id)||!uploadId||!Array.isArray(parts)||parts.length===0||parts.length>10000)return json({error:'Date upload invalide.'},400);
  const checked=parts.map(p=>({partNumber:Number(p.partNumber),etag:String(p.etag||'')})).sort((a,b)=>a.partNumber-b.partNumber);
  if(checked.some((p,i)=>!Number.isInteger(p.partNumber)||p.partNumber!==i+1||!p.etag))return json({error:'Ordine sau identificatori de bucăți invalizi.'},400);
  const r=await bucket.resumeMultipartUpload(key,uploadId).complete(checked);
  return json({ok:true,key,size:r.size});
}catch(e){return failure(e);}}
