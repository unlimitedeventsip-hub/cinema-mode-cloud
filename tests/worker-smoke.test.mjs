import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import worker from '../src/worker.js';

if (!globalThis.crypto) globalThis.crypto=webcrypto;
const base='https://cinema-mode.test';
const supabase='https://asixkabhesmhbqunxqby.supabase.co';
const pub='sb_publishable_test';
const sec='sb_secret_test_server_only';
function env(overrides={}) {
 return {SUPABASE_URL:supabase,SUPABASE_ANON_KEY:pub,SUPABASE_SERVER_KEY:sec,TICKET_SECRET:'z'.repeat(64),CINEMA_BUCKET:{},ASSETS:{fetch:()=>new Response('static content')},...overrides};
}
async function call(path,method='GET',headers={},body,settings=env()){
 const request=new Request(base+path,{method,headers,body:body==null?undefined:typeof body==='string'?body:JSON.stringify(body)});
 const response=await worker.fetch(request,settings,{});
 return {status:response.status,data:await response.json().catch(()=>null),response};
}
test('API health reports required runtime bindings without showing secrets',async()=>{
 const x=await call('/api/health');
 assert.equal(x.status,200);
 assert.equal(x.data.ready,true);
 assert.equal(x.data.checks.authConfig,true);
 assert.equal(x.data.checks.devicePairing,true);
 assert.doesNotMatch(JSON.stringify(x.data),/sb_secret_/);
 const y=await call('/api/health','GET',{},null,env({SUPABASE_SERVER_KEY:undefined,CINEMA_BUCKET:undefined}));
 assert.equal(y.data.ready,false);
 assert.equal(y.data.checks.devicePairing,false);
 assert.equal(y.data.checks.storage,false);
});
test('Upload requires authentication and invalid methods are rejected',async()=>{
 const x=await call('/api/upload/init','POST',{'Content-Type':'application/json'},{filename:'demo.mp4',size:1024});
 assert.equal(x.status,401);
 const y=await call('/api/upload/init','GET');
 assert.equal(y.status,405);
 const z=await call('/api/no-such-route');
 assert.equal(z.status,404);
 const p=await call('/api/play');
 assert.equal(p.status,403);
});
test('Missing secret fails explicitly before a pairing code is issued',async()=>{
 const result=await call('/api/device/start','POST',{'Content-Type':'application/json'},{name:'Acer'},env({SUPABASE_SERVER_KEY:undefined}));
 assert.equal(result.status,503);
 assert.match(result.data.error,/SUPABASE_SERVER_KEY/);
});
test('Projector can pair with owner, poll, then be revoked without device password',async()=>{
 const database=[];
 const originalFetch=globalThis.fetch;
 try {
  globalThis.fetch=async (target,config={})=>{
   const u=new URL(target.toString());
   if(u.pathname==='/auth/v1/user'){
    assert.match(config.headers.Authorization,/^Bearer /);
    return Response.json({id:'11111111-1111-4111-8111-111111111111'});
   }
   assert.ok(u.pathname.startsWith('/rest/v1/'),'Unexpected REST endpoint: '+u);
   assert.equal(config.headers.apikey,sec);
   const table=u.pathname.split('/').pop();
   const filters=[...u.searchParams].filter(([k,v])=>v.startsWith('eq.')||v.startsWith('gt.'));
   function eligible(row) {
    return filters.every(([k,v])=>{
     if(v.startsWith('eq.'))return String(row[k]??'')===v.slice(3);
     if(v.startsWith('gt.'))return Date.parse(row[k])>Date.parse(v.slice(3));
     return true;
    });
   }
   if(table==='cinema_commands')return Response.json([]);
   assert.equal(table,'cinema_devices');
   if(config.method==='POST'){
    const item={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',last_command_id:0,owner_id:null,last_seen_at:null,paired_at:null,...JSON.parse(config.body)};
    database.push(item);return Response.json([item],{status:201});
   }
   const selected=database.filter(eligible);
   if(config.method==='PATCH'){
    const body=JSON.parse(config.body);
    for(const row of selected)Object.assign(row,body);
    if(config.headers.Prefer?.includes('return=minimal'))return new Response(null,{status:204});
    return Response.json(selected);
   }
   return Response.json(selected);
  };
  const created=await call('/api/device/start','POST',{'Content-Type':'application/json'},{name:'Acer Proiector'});
  assert.equal(created.status,201);
  assert.match(created.data.pairingCode,/^[A-Z2-9]{8}$/);
  assert.match(created.data.deviceToken,/^[0-9a-f]{64}$/);
  assert.equal(database.length,1);
  assert.notEqual(database[0].token_sha256,created.data.deviceToken);
  assert.notEqual(database[0].pairing_sha256,created.data.pairingCode);
  const auth={'Authorization':'Device '+created.data.deviceToken};
  const pending=await call('/api/device/poll','POST',auth,{});
  assert.equal(pending.data.state,'pending');
  const approved=await call('/api/device/approve','POST',{'Content-Type':'application/json',Authorization:'Bearer pretend-user-jwt'},{code:created.data.pairingCode});
  assert.equal(approved.status,200);
  assert.equal(approved.data.ok,true);
  const paired=await call('/api/device/poll','POST',auth,{});
  assert.equal(paired.data.state,'paired');
  assert.deepEqual(paired.data.commands,[]);
  const revoked=await call('/api/device/revoke','POST',{'Content-Type':'application/json',Authorization:'Bearer pretend-user-jwt'},{id:database[0].id});
  assert.equal(revoked.data.ok,true);
  const denied=await call('/api/device/poll','POST',auth,{});
  assert.equal(denied.status,401);
 } finally {globalThis.fetch=originalFetch;}
});
