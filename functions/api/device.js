
import { authenticate, ensureBucket, ownKey, makeTicket, json, failure } from '../_lib/security.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DEVICE_RE = /^[0-9a-f]{64}$/;
const textEncoder = new TextEncoder();

function secureHex(bytes=32) {
  const raw=new Uint8Array(bytes);
  crypto.getRandomValues(raw);
  return Array.from(raw,b=>b.toString(16).padStart(2,'0')).join('');
}
function newCode() {
  const bytes=new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes,n=>CODE_ALPHABET[n%CODE_ALPHABET.length]).join('');
}
async function sha(value) {
  const hashed=await crypto.subtle.digest('SHA-256',textEncoder.encode(value));
  return Array.from(new Uint8Array(hashed),x=>x.toString(16).padStart(2,'0')).join('');
}
function serverConfiguration(env) {
  const url=(env.SUPABASE_URL||'').replace(/\/+$/,'');
  const key=env.SUPABASE_SERVER_KEY;
  if(!url||!key)throw Object.assign(new Error('Lipsește SUPABASE_SERVER_KEY în secretele Worker-ului Cloudflare.'),{status:503});
  if(!key.startsWith('sb_secret_')&&!key.startsWith('eyJ'))throw Object.assign(new Error('SUPABASE_SERVER_KEY trebuie să fie cheia secretă a proiectului Supabase screen.'),{status:503});
  return {url,key};
}
async function database(env,table,{method='GET',filters={},body,prefer}={}) {
  const {url,key}=serverConfiguration(env);
  const endpoint=new URL(url+'/rest/v1/'+table);
  for(const [k,v] of Object.entries(filters)) endpoint.searchParams.set(k,String(v));
  const headers={apikey:key,Accept:'application/json','Cache-Control':'no-store'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(prefer)headers.Prefer=prefer;
  const response=await fetch(endpoint.toString(),{method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  const data=await response.json().catch(()=>null);
  if(!response.ok) {
    console.warn('Cinema devices Supabase REST error',response.status,table,data?.code||'');
    throw Object.assign(new Error('Eroare de conectare la dispozitivele din Supabase ('+response.status+').'),{status:502});
  }
  return data;
}
function deviceHeader(request) {
  const match=/^Device ([0-9a-f]{64})$/i.exec(request.headers.get('Authorization')||'');
  if(!match)return null;
  return match[1].toLowerCase();
}
async function getDevice(request,env) {
  const token=deviceHeader(request);
  if(!token||!DEVICE_RE.test(token))throw Object.assign(new Error('Acest proiector nu are o asociere validă.'),{status:401});
  const items=await database(env,'cinema_devices',{filters:{
    select:'id,owner_id,status,pairing_expires_at,device_name,last_command_id,paired_at,last_seen_at',
    token_sha256:'eq.'+await sha(token),limit:'1'
  }});
  const device=items?.[0];
  if(!device||device.status==='revoked')throw Object.assign(new Error('Accesul acestui proiector a fost revocat. Generează un cod nou.'),{status:401});
  return device;
}
function requirePaired(device) {
  if(device.status!=='paired'||!device.owner_id)throw Object.assign(new Error('Asociază mai întâi proiectorul de pe laptop.'),{status:403});
}
function safeNumber(value,max=864000) {
  const num=Number(value);
  return Number.isFinite(num)?Math.max(0,Math.min(max,num)):0;
}
async function getFilm(env,owner,filmId) {
  const rows=await database(env,'cinema_films',{filters:{
    select:'id,title,year,r2_key,mime_type,subtitles,poster_url,duration_s',
    id:'eq.'+filmId,owner_id:'eq.'+owner,limit:'1'
  }});
  const film=rows?.[0];
  if(!film||!ownKey(film.r2_key,owner))return null;
  ensureBucket(env);
  return {...film,deviceStreamUrl:'/api/play?ticket='+encodeURIComponent(await makeTicket(film.r2_key,env))};
}
async function start(request,env) {
  serverConfiguration(env);
  const input=await request.json().catch(()=>({}));
  const name=String(input.name||'Proiector Cinema').trim().slice(0,80)||'Proiector Cinema';
  const code=newCode();
  const codeHash=await sha(code);
  const expires=new Date(Date.now()+10*60*1000).toISOString();
  const prior=deviceHeader(request);
  if(prior) {
    const devices=await database(env,'cinema_devices',{filters:{select:'id,status',token_sha256:'eq.'+await sha(prior),limit:'1'}});
    const item=devices?.[0];
    if(item?.status==='paired')return json({state:'paired',message:'Proiectorul este deja asociat.'},409);
    if(item && item.status==='pending') {
      await database(env,'cinema_devices',{method:'PATCH',filters:{id:'eq.'+item.id,status:'eq.pending'},body:{
        pairing_sha256:codeHash,pairing_expires_at:expires,device_name:name
      },prefer:'return=representation'});
      return json({state:'pending',pairingCode:code,expiresAt:expires});
    }
  }
  const token=secureHex();
  await database(env,'cinema_devices',{method:'POST',body:{
    token_sha256:await sha(token),
    pairing_sha256:codeHash,pairing_expires_at:expires,device_name:name,status:'pending'
  },prefer:'return=representation'});
  return json({state:'pending',deviceToken:token,pairingCode:code,expiresAt:expires},201);
}
async function approve(request,env) {
  const user=await authenticate(request,env);
  const input=await request.json().catch(()=>({}));
  const code=String(input.code||'').trim().toUpperCase().replace(/[-\s]/g,'');
  if(code.length!==8||[...code].some(c=>!CODE_ALPHABET.includes(c)))return json({error:'Cod invalid. Introdu cele 8 caractere afișate pe proiector.'},400);
  const match=await database(env,'cinema_devices',{filters:{
    select:'id,device_name',pairing_sha256:'eq.'+await sha(code),status:'eq.pending',
    pairing_expires_at:'gt.'+new Date().toISOString(),limit:'1'
  }});
  const item=match?.[0];
  if(!item)return json({error:'Cod inexistent sau expirat. Generează unul nou pe proiector.'},404);
  const last=await database(env,'cinema_commands',{filters:{
    select:'id',owner_id:'eq.'+user.id,order:'id.desc',limit:'1'
  }});
  const rows=await database(env,'cinema_devices',{method:'PATCH',filters:{
    select:'id,device_name',id:'eq.'+item.id,status:'eq.pending',
    pairing_expires_at:'gt.'+new Date().toISOString()
  },body:{
    owner_id:user.id,status:'paired',pairing_sha256:null,pairing_expires_at:null,
    paired_at:new Date().toISOString(),last_command_id:Number(last?.[0]?.id||0)
  },prefer:'return=representation'});
  if(!rows?.length)return json({error:'Codul a fost folosit deja. Reîncearcă asocierea.'},409);
  return json({ok:true,device:rows[0]});
}
async function list(request,env) {
  const user=await authenticate(request,env);
  const items=await database(env,'cinema_devices',{filters:{
    select:'id,device_name,paired_at,last_seen_at,status',
    owner_id:'eq.'+user.id,status:'eq.paired',order:'paired_at.desc',limit:'100'
  }});
  return json({devices:items||[]});
}
async function revoke(request,env) {
  const user=await authenticate(request,env);
  const {id}=await request.json().catch(()=>({}));
  if(!/^[0-9a-f-]{36}$/i.test(String(id||'')))return json({error:'ID proiector invalid.'},400);
  const rows=await database(env,'cinema_devices',{method:'PATCH',filters:{
    select:'id',id:'eq.'+id,owner_id:'eq.'+user.id,status:'eq.paired'
  },body:{status:'revoked',pairing_sha256:null,pairing_expires_at:null},prefer:'return=representation'});
  if(!rows?.length)return json({error:'Nu găsesc proiectorul în contul tău.'},404);
  return json({ok:true});
}
async function poll(request,env) {
  const dev=await getDevice(request,env);
  if(dev.status==='pending')return json({state:Date.parse(dev.pairing_expires_at)<Date.now()?'expired':'pending',expiresAt:dev.pairing_expires_at});
  requirePaired(dev);
  if(!dev.last_seen_at || Date.now()-Date.parse(dev.last_seen_at)>30000)await database(env,'cinema_devices',{method:'PATCH',filters:{id:'eq.'+dev.id,status:'eq.paired'},body:{last_seen_at:new Date().toISOString()}});
  const commands=await database(env,'cinema_commands',{filters:{
    select:'id,action,film_id,value',
    owner_id:'eq.'+dev.owner_id,id:'gt.'+dev.last_command_id,order:'id.asc',limit:'15'
  }});
  const mapped=[];
  for(const command of (commands||[])) {
    if(command.action==='load') {
      const film=command.film_id?await getFilm(env,dev.owner_id,command.film_id):null;
      mapped.push({...command,film});
    } else mapped.push(command);
  }
  return json({state:'paired',deviceName:dev.device_name,commands:mapped});
}
async function ack(request,env) {
  const dev=await getDevice(request,env);
  requirePaired(dev);
  const {lastCommandId}=await request.json().catch(()=>({}));
  const id=Number(lastCommandId);
  if(!Number.isSafeInteger(id)||id<dev.last_command_id)return json({error:'Cursor invalid.'},400);
  const max=await database(env,'cinema_commands',{filters:{
    select:'id',owner_id:'eq.'+dev.owner_id,order:'id.desc',limit:'1'
  }});
  if(id>Number(max?.[0]?.id||0))return json({error:'Cursor depășește ultima comandă.'},400);
  await database(env,'cinema_devices',{method:'PATCH',filters:{
    id:'eq.'+dev.id,status:'eq.paired',last_command_id:'lte.'+id
  },body:{last_command_id:id,last_seen_at:new Date().toISOString()}});
  return json({ok:true});
}
async function state(request,env) {
  const dev=await getDevice(request,env);
  requirePaired(dev);
  const body=await request.json().catch(()=>({}));
  const filmId=body.film_id||null;
  if(filmId) {
    const film=await database(env,'cinema_films',{filters:{select:'id',owner_id:'eq.'+dev.owner_id,id:'eq.'+filmId,limit:'1'}});
    if(!film?.length)return json({error:'Film indisponibil pentru acest cont.'},403);
  }
  await database(env,'cinema_state',{method:'POST',body:{
    owner_id:dev.owner_id,film_id:filmId,position_s:safeNumber(body.position_s),
    duration_s:safeNumber(body.duration_s),playing:body.playing===true,
    volume:Math.max(0,Math.min(1,Number(body.volume)||0)),updated_at:new Date().toISOString()
  },prefer:'resolution=merge-duplicates,return=minimal'});
  await database(env,'cinema_devices',{method:'PATCH',filters:{id:'eq.'+dev.id,status:'eq.paired'},body:{last_seen_at:new Date().toISOString()}});
  return json({ok:true});
}
export async function onRequest({request,env}) {
  try {
    const action=new URL(request.url).pathname.split('/').pop();
    const methods={start:'POST',approve:'POST',list:'GET',revoke:'POST',poll:'POST',ack:'POST',state:'POST'};
    if(!methods[action])return json({error:'Rută necunoscută.'},404);
    if(request.method!==methods[action])return new Response('Method Not Allowed',{status:405,headers:{Allow:methods[action]}});
    if(action==='start')return await start(request,env);
    if(action==='approve')return await approve(request,env);
    if(action==='list')return await list(request,env);
    if(action==='revoke')return await revoke(request,env);
    if(action==='poll')return await poll(request,env);
    if(action==='ack')return await ack(request,env);
    if(action==='state')return await state(request,env);
  } catch(e) { return failure(e); }
}
