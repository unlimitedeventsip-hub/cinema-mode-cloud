import {authenticate,ensureBucket,json,failure} from '../../_lib/security.js';
export async function onRequestPost({request,env}){try{
  const user=await authenticate(request,env), bucket=ensureBucket(env);
  const data=await request.json();
  const raw=String(data.filename||'movie.mp4');const ext=raw.toLowerCase().split('.').pop();
  if(!['mp4','m4v','mov','webm','mkv','avi'].includes(ext))return json({error:'Format video neacceptat.'},400);
  const size=Number(data.size);
  if(!Number.isSafeInteger(size)||size<=0||size>300*1024*1024*1024)return json({error:'Dimensiune video invalidă (maxim 300GB per film).'},400);
  const type={mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm',mkv:'video/x-matroska',avi:'video/x-msvideo'}[ext];
  const key=`${user.id}/${crypto.randomUUID()}.${ext}`;
  const upload=await bucket.createMultipartUpload(key,{httpMetadata:{contentType:type},customMetadata:{filename:raw.slice(0,240),owner:user.id}});
  return json({key,uploadId:upload.uploadId});
}catch(e){return failure(e);}}
