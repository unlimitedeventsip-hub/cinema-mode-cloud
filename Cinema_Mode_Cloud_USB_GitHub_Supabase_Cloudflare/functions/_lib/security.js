const e = new TextEncoder();
export function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
export async function authenticate(request,env){
  const token=(request.headers.get('Authorization')||'').match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)throw Object.assign(new Error('Autentificare necesară'),{status:401});
  const endpoint=(env.SUPABASE_URL||env.VITE_SUPABASE_URL||'').replace(/\/$/,'');
  const apikey=env.SUPABASE_ANON_KEY||env.VITE_SUPABASE_ANON_KEY;
  if(!endpoint||!apikey)throw Object.assign(new Error('Supabase nu este configurat pe Cloudflare.'),{status:503});
  const r=await fetch(`${endpoint}/auth/v1/user`,{headers:{Authorization:`Bearer ${token}`,apikey},cf:{cacheTtl:0}});
  if(!r.ok)throw Object.assign(new Error('Sesiune invalidă sau expirată'),{status:401});
  const user=await r.json();
  if(!user.id)throw Object.assign(new Error('Nu există utilizator'),{status:401});
  return user;
}
export function ownKey(key,uid){return typeof key==='string'&&key.startsWith(`${uid}/`) && /^[-\w.\/]+$/.test(key) && !key.includes('..') && key.length<350;}
export function ensureBucket(env){if(!env.CINEMA_BUCKET)throw Object.assign(new Error('Lipsește R2 binding CINEMA_BUCKET.'),{status:503});return env.CINEMA_BUCKET;}
function base64url(data){const b=typeof data==='string'?e.encode(data):data;let s='';for(const x of b)s+=String.fromCharCode(x);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');}
function from64(s){const str=atob(s.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(str,c=>c.charCodeAt(0));}
async function hmacKey(env){if(!env.TICKET_SECRET || env.TICKET_SECRET.length<32)throw Object.assign(new Error('Lipsește TICKET_SECRET (minim 32 caractere).'),{status:503});return crypto.subtle.importKey('raw',e.encode(env.TICKET_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
export async function makeTicket(key,env){const payload=base64url(JSON.stringify({key,expires:Date.now()+4*3600*1000}));const sig=new Uint8Array(await crypto.subtle.sign('HMAC',await hmacKey(env),e.encode(payload)));return payload+'.'+base64url(sig);}
export async function readTicket(ticket,env){try{const bits=String(ticket||'').split('.');if(bits.length!==2)return null;const valid=await crypto.subtle.verify('HMAC',await hmacKey(env),from64(bits[1]),e.encode(bits[0]));if(!valid)return null;const data=JSON.parse(new TextDecoder().decode(from64(bits[0])));if(typeof data.key!=='string'||!Number.isFinite(data.expires)||data.expires<Date.now()||data.expires>Date.now()+4*3600*1000+60000)return null;return data;}catch(_){return null;}}
export function failure(e){console.warn('Cinema API:',e?.message);return json({error:e.message||'Eroare server'},e.status||500);}
