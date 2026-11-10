import {ensureBucket,readTicket,failure} from '../_lib/security.js';
async function serve({request,env},head=false){try{
 const bucket=ensureBucket(env),url=new URL(request.url),ticket=await readTicket(url.searchParams.get('ticket'),env);
 if(!ticket)return new Response('Invalid or expired ticket',{status:403});
 const obj=head?await bucket.head(ticket.key):await bucket.get(ticket.key,{range:request.headers});
 if(!obj)return new Response('Not found',{status:404});
 const headers=new Headers({'Accept-Ranges':'bytes','Cache-Control':'private, max-age=0, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'});
 obj.writeHttpMetadata(headers);headers.set('Content-Type',obj.httpMetadata?.contentType||'application/octet-stream');headers.set('ETag',obj.httpEtag);
 let status=200;
 if(!head && obj.range && typeof obj.range.offset==='number' && typeof obj.range.length==='number' && request.headers.has('Range')){
   headers.set('Content-Range',`bytes ${obj.range.offset}-${obj.range.offset+obj.range.length-1}/${obj.size}`);
   headers.set('Content-Length',String(obj.range.length));status=206;
 }else headers.set('Content-Length',String(obj.size));
 return new Response(head?null:obj.body,{status,headers});
}catch(e){return failure(e);}}
export const onRequestGet=ctx=>serve(ctx,false);
export const onRequestHead=ctx=>serve(ctx,true);
