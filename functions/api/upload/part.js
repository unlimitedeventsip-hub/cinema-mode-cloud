import {authenticate,ensureBucket,ownKey,json,failure} from '../../_lib/security.js';
export async function onRequestPost({request,env}){try{
  const user=await authenticate(request,env),bucket=ensureBucket(env),url=new URL(request.url);
  const key=url.searchParams.get('key'),id=url.searchParams.get('uploadId'),num=Number(url.searchParams.get('partNumber'));
  if(!ownKey(key,user.id)||!id||!Number.isInteger(num)||num<1||num>10000)return json({error:'Parametri upload invalizi.'},400);
  if(!request.body)return json({error:'Lipsește conținutul.'},400);
  const upload=bucket.resumeMultipartUpload(key,id);const part=await upload.uploadPart(num,request.body);
  return json({partNumber:part.partNumber,etag:part.etag});
}catch(e){return failure(e);}}
