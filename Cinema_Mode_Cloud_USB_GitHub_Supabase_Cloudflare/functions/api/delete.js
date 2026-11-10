import {authenticate,ensureBucket,ownKey,json,failure} from '../_lib/security.js';
export async function onRequestPost({request,env}){try{const user=await authenticate(request,env),bucket=ensureBucket(env),{key}=await request.json();if(!ownKey(key,user.id))return json({error:'Acces interzis'},403);await bucket.delete(key);return json({ok:true});}catch(e){return failure(e);}}
