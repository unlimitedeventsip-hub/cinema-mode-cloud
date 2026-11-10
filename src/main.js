import { createClient } from '@supabase/supabase-js';
import './style.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const $ = id => document.getElementById(id);
const client = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;
const status = { user:null, films:[], current:null, view:new URLSearchParams(location.search).get('mode') || 'library', commandId:0, currentSub:'off', cues:[], offset:0, remoteState:null, localUrl:null, screenReady:false, lastStateSent:0, busy:false, guest:false, deviceMode:false, devicePaired:false, deviceToken:null, devicePairCode:null };
let toastTimer, commandInterval, remoteInterval, channel, deviceInterval, devicePollBusy=false, deviceReady=false;

function toast(message, error=false) { const t=$('toast'); t.textContent=message; t.classList.toggle('error',error); t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),4500); }
function escapeHtml(t) { return String(t ?? '').replace(/[&<>"']/g, a=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[a])); }
function safePoster(src) { try { let u=new URL(src); if(u.protocol==='https:' || (u.protocol==='data:' && /^data:image\/(jpeg|png|webp);base64,/.test(src)))return src; } catch(_){} return ''; }
function time(t) { t=Math.max(0,Math.floor(Number(t)||0)); const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=t%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`; }
function video() { return $('cinemaVideo'); }
function viewName(v) {return {library:'BIBLIOTECĂ',screen:'ECRAN CINEMA',remote:'TELECOMANDĂ'}[v]||'BIBLIOTECĂ';}
async function sessionToken() { const {data,error}=await client.auth.getSession(); if(error || !data?.session?.access_token)throw Error('Sesiunea a expirat. Conectează-te din nou.');return data.session.access_token; }
async function api(path,{method='GET',json,body,headers={}}={}) { const token=await sessionToken(); const res=await fetch(path,{method,headers:{Authorization:`Bearer ${token}`,...(json?{'Content-Type':'application/json'}:{}),...headers},body:json?JSON.stringify(json):body,cache:'no-store'}); const data=await res.json().catch(()=>({})); if(!res.ok)throw Error(data.error||`Eroare server (${res.status})`);return data; }
async function runSafe(fn) { try{await fn();}catch(e){console.error(e);toast(e.message||'Eroare neașteptată',true);} }

async function signIn(e) {e.preventDefault();if(!client)return toast('Lipsesc variabilele VITE_SUPABASE_URL și VITE_SUPABASE_ANON_KEY.',true); const btn=$('loginBtn');btn.disabled=true;try{let {data,error}=await client.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});if(error)throw error;await start(data.user);}catch(e){toast(e.message,true);}finally{btn.disabled=false;}}
async function register() {if(!client)return toast('Configurează Supabase mai întâi.',true);const email=$('email').value.trim(),password=$('password').value;if(!email||password.length<6)return toast('Introdu emailul și parola de minimum 6 caractere.',true);const {data,error}=await client.auth.signUp({email,password});if(error)return toast(error.message,true);toast(data.session?'Cont creat!':'Cont creat. Confirmă emailul, apoi autentifică-te.');if(data.session)await start(data.user);}
function enterGuest(){status.guest=true;status.user=null;$('auth').classList.add('hidden');$('shell').classList.remove('hidden');$('userEmail').textContent='USB · FĂRĂ CONT';$('addMovieButton').disabled=true;document.querySelectorAll('[data-view="remote"]').forEach(b=>b.disabled=true);drawFilms();setView('screen');toast('Alege un film din stick sau din laptop pentru a începe.');}
async function start(user) {status.guest=false;status.user=user;$('auth').classList.add('hidden');$('shell').classList.remove('hidden');$('userEmail').textContent=user.email||'';await loadFilms();setView(status.view);startRealtime();}
async function logout(){if(status.guest){location.assign('/');return;}clearInterval(commandInterval);clearInterval(remoteInterval);if(channel)client.removeChannel(channel);if(status.localUrl)URL.revokeObjectURL(status.localUrl);video().pause();await client.auth.signOut();location.assign('/');}

async function loadFilms(){const {data,error}=await client.from('cinema_films').select('*').order('created_at',{ascending:false});if(error){toast('Nu pot încărca biblioteca. Ai rulat schema.sql în Supabase?',true);console.error(error);return;}status.films=data||[];drawFilms();}
function posterMarkup(film){const p=safePoster(film.poster_url);return p?`<img src="${escapeHtml(p)}" alt="Poster ${escapeHtml(film.title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`:'<span class="poster-glyph">◈</span>';}
function drawFilms(){$('filmCount').textContent=status.films.length;const filter=$('searchInput').value.toLowerCase();const films=status.films.filter(f=>f.title.toLowerCase().includes(filter));$('emptyLibrary').classList.toggle('hidden',status.films.length>0);$('filmGrid').innerHTML=films.map(f=>`<button class="film-card" data-film="${escapeHtml(f.id)}" title="Redă ${escapeHtml(f.title)}"><div class="film-poster">${posterMarkup(f)}<span class="film-play">▶</span></div><div class="film-meta"><h3>${escapeHtml(f.title)}</h3><p>${f.year||'Cinema'} · ${time(f.duration_s)} · Original</p></div></button>`).join('');$('remoteList').innerHTML=status.films.map(f=>`<button data-remote-film="${escapeHtml(f.id)}"><div class="remote-thumb">${posterMarkup(f)}</div><div><strong>${escapeHtml(f.title)}</strong><small>${f.year||'Film'} · ${time(f.duration_s)}</small></div><span style="margin-left:auto;color:#e5bb80">▶</span></button>`).join('');}
function setView(next){status.view=['library','screen','remote'].includes(next)?next:'library';if(status.guest&&status.view==='remote')status.view='screen';for(const v of ['library','screen','remote'])$(v+'View').classList.toggle('hidden',v!==status.view);document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===status.view));$('breadcrumb').textContent=`SPAȚIUL TĂU / ${viewName(status.view)}`;history.replaceState({},'',status.view==='library'?'/':`/?mode=${status.view}`);if(status.view==='screen'){activateScreen();}if(status.view==='remote'){refreshRemoteState().catch(()=>{});listProjectors().catch(()=>{});}}
async function activateScreen(){if(!client||!status.user)return;if(status.screenReady)return;status.screenReady=true;try{const {data,error}=await client.from('cinema_commands').select('id').order('id',{ascending:false}).limit(1);if(!error && data?.length)status.commandId=Math.max(status.commandId,Number(data[0].id));const {data:state}=await client.from('cinema_state').select('*').eq('owner_id',status.user.id).maybeSingle();if(state?.film_id){const f=status.films.find(a=>a.id===state.film_id);if(f){await loadPlayer(f,false);video().currentTime=state.position_s||0;}}}catch(e){console.warn(e);} }

async function videoTicket(key){const d=await api('/api/ticket?key='+encodeURIComponent(key));return d.url;}
async function loadPlayer(film,autoplay=false){if(!film)return;status.current=film;status.cues=[];status.currentSub='off';status.offset=0;$('subtitleOffset').value='0';$('subtitleSelect').innerHTML='<option value="off">Dezactivată</option>';$('playerPlaceholder').classList.add('hidden');$('playingTitle').textContent=film.title;$('playerInfo').textContent=(film.localSource?'USB / local · fără upload · ':'Streaming original · ')+(film.mime_type||'video');const v=video();v.pause();let src;if(film.localSource){src=film.localSource;}else if(film.deviceStreamUrl){src=film.deviceStreamUrl;}else{src=await videoTicket(film.r2_key);}v.src=src;v.load();setSubtitleOptions(film);syncSubtitle();if(autoplay){try{await v.play();}catch(_){toast('Apasă ▶ direct în player pentru a permite redarea.');}}await sendState();}
function toSeconds(s){const x=String(s).trim().replace(',','.').split(':').map(Number);if(x.some(n=>!Number.isFinite(n)))return NaN;return x.reduce((a,b)=>a*60+b,0);}
function parseSubtitle(content){const text=String(content||'').replace(/^\uFEFF/,'').replace(/\r/g,'');const blocks=text.split(/\n\s*\n/);const cues=[];for(const block of blocks){const rows=block.split('\n');const i=rows.findIndex(l=>l.includes('-->'));if(i<0)continue;const points=rows[i].split('-->');if(points.length<2)continue;const begin=toSeconds(points[0]),end=toSeconds(points[1].trim().split(' ')[0]);if(!Number.isFinite(begin)||!Number.isFinite(end))continue;const body=rows.slice(i+1).join('\n').replace(/<[^>]*>/g,'').trim();if(body)cues.push({start:begin,end,text:body});}return cues.sort((a,b)=>a.start-b.start);}
function setSubtitleOptions(film){const subtitles=Array.isArray(film.subtitles)?film.subtitles:[];$('subtitleSelect').innerHTML='<option value="off">Dezactivată</option>';subtitles.forEach((s,i)=>{const opt=document.createElement('option');opt.value=String(i);opt.textContent=s.label||s.lang||`Subtitrarea ${i+1}`;$('subtitleSelect').appendChild(opt);});if(subtitles.length){$('subtitleSelect').value='0';status.currentSub='0';status.cues=parseSubtitle(subtitles[0].text);}}
function syncSubtitle(){const out=$('subtitleOverlay');if(!status.cues.length||status.currentSub==='off'){out.textContent='';return;}const t=video().currentTime-Number(status.offset||0);const cue=status.cues.find(c=>c.start<=t&&t<=c.end);out.textContent=cue?.text||'';}
async function sendState(){const v=video();if(status.deviceMode){if(status.devicePaired){await deviceRequest('/api/device/state',{method:'POST',json:{film_id:status.current?.id||null,position_s:Number.isFinite(v.currentTime)?v.currentTime:0,duration_s:Number.isFinite(v.duration)?v.duration:0,playing:!v.paused,volume:v.volume}});}return;}if(!status.user||status.view!=='screen')return;const record={owner_id:status.user.id,film_id:status.current?.localSource?null:(status.current?.id||null),position_s:Number.isFinite(v.currentTime)?v.currentTime:0,duration_s:Number.isFinite(v.duration)?v.duration:0,playing:!v.paused,volume:v.volume,updated_at:new Date().toISOString()};const {error}=await client.from('cinema_state').upsert(record,{onConflict:'owner_id'});if(error)console.warn('State:',error.message);}
async function issueCommand(action,filmId=null,value=null){await client.from('cinema_commands').insert({owner_id:status.user.id,action,film_id:filmId,value}).then(({error})=>{if(error)throw error;});toast('Comandă trimisă către proiector');}
async function applyCommand(cmd){if(status.view!=='screen')return;const v=video();if(cmd.action==='load'){const film=cmd.film||status.films.find(f=>f.id===cmd.film_id);if(film)await loadPlayer(film,true);}else if(cmd.action==='play'){await v.play().catch(()=>toast('Confirmă ▶ pe proiector pentru a permite redarea.',true));}else if(cmd.action==='pause'){v.pause();}else if(cmd.action==='toggle'){if(v.paused)await v.play().catch(()=>toast('Confirmă ▶ pe proiector.',true));else v.pause();}else if(cmd.action==='stop'){v.pause();v.removeAttribute('src');v.load();status.current=null;$('playerPlaceholder').classList.remove('hidden');$('playingTitle').textContent='Niciun film selectat';$('subtitleOverlay').textContent='';}else if(cmd.action==='seek'){if(Number.isFinite(Number(cmd.value)))v.currentTime=Math.max(0,Number(cmd.value));}else if(cmd.action==='skip'){v.currentTime=Math.max(0,(v.currentTime||0)+Number(cmd.value||0));}await sendState();}
async function pollCommands(){if(status.view!=='screen'||!status.user)return;const {data,error}=await client.from('cinema_commands').select('*').gt('id',status.commandId).order('id',{ascending:true}).limit(25);if(error)return;for(const cmd of(data||[])){if(Number(cmd.id)<=status.commandId)continue;status.commandId=Number(cmd.id);try{await applyCommand(cmd);}catch(e){console.warn('Comandă:',e);}}}
async function refreshRemoteState(){if(!status.user)return;const {data}=await client.from('cinema_state').select('*').eq('owner_id',status.user.id).maybeSingle();if(!data)return;status.remoteState=data;const film=status.films.find(f=>f.id===data.film_id);$('remoteTitle').textContent=film?.title||'Niciun film';$('remoteCurrent').textContent=time(data.position_s);$('remoteDuration').textContent=time(data.duration_s);$('remoteSeek').max=Math.max(1,Number(data.duration_s)||100);if(document.activeElement!==$('remoteSeek'))$('remoteSeek').value=data.position_s||0;$('remotePause').textContent=data.playing?'Ⅱ':'▶';const p=safePoster(film?.poster_url);$('remotePoster').innerHTML=p?`<img alt="Poster" src="${escapeHtml(p)}" style="height:100%;width:100%;object-fit:contain" referrerpolicy="no-referrer">`:'◈';}
function startRealtime(){clearInterval(commandInterval);clearInterval(remoteInterval);if(channel)client.removeChannel(channel);channel=client.channel('cinema-'+status.user.id).on('postgres_changes',{event:'INSERT',schema:'public',table:'cinema_commands',filter:`owner_id=eq.${status.user.id}`},p=>{if(status.view==='screen'&&Number(p.new.id)>status.commandId)pollCommands();}).on('postgres_changes',{event:'*',schema:'public',table:'cinema_state',filter:`owner_id=eq.${status.user.id}`},()=>{if(status.view==='remote')refreshRemoteState().catch(()=>{});}).subscribe();commandInterval=setInterval(()=>pollCommands().catch(()=>{}),2500);remoteInterval=setInterval(()=>{if(status.view==='remote')refreshRemoteState().catch(()=>{});},4000);}

function showUpload(){if(!status.user)return;$('uploadModal').classList.remove('hidden');}
function closeUpload(){if(status.busy)return;$('uploadModal').classList.add('hidden');}
async function probeVideo(file){return new Promise(resolve=>{const blob=URL.createObjectURL(file);const v=document.createElement('video');const timeout=setTimeout(done,3000);function done(){clearTimeout(timeout);const d=Number.isFinite(v.duration)?v.duration:0;URL.revokeObjectURL(blob);resolve(d);}v.preload='metadata';v.onloadedmetadata=done;v.onerror=done;v.src=blob;});}
async function makeThumbnail(file){return new Promise(resolve=>{const blob=URL.createObjectURL(file);const v=document.createElement('video');v.muted=true;v.preload='auto';let finished=false;const timeout=setTimeout(()=>finish(''),5000);function finish(result){if(finished)return;finished=true;clearTimeout(timeout);v.removeAttribute('src');v.load();URL.revokeObjectURL(blob);resolve(result);}v.onloadedmetadata=()=>{try{v.currentTime=Math.min(2,Math.max(0,(v.duration||0)/3));}catch(_){finish('');}};v.onseeked=()=>{try{const c=document.createElement('canvas');c.width=340;c.height=510;const ctx=c.getContext('2d');ctx.fillStyle='#151722';ctx.fillRect(0,0,c.width,c.height);const ratio=Math.min(c.width/v.videoWidth,c.height/v.videoHeight);const w=v.videoWidth*ratio,h=v.videoHeight*ratio;ctx.drawImage(v,(c.width-w)/2,(c.height-h)/2,w,h);finish(c.toDataURL('image/jpeg',.72));}catch(_){finish('');}};v.onerror=()=>finish('');v.src=blob;});}
async function uploadFilm(e){e.preventDefault();if(status.busy)return;const file=$('videoFile').files[0];if(!file)return toast('Alege un fișier video.',true);if(file.size===0)return toast('Fișierul este gol.',true);const title=$('movieTitle').value.trim();if(!title)return;status.busy=true;$('submitUpload').disabled=true;$('cancelUpload').disabled=true;$('closeUpload').disabled=true;$('uploadProgress').classList.remove('hidden');let upload;
try{
const parts=[];const chunkSize=12*1024*1024;upload=await api('/api/upload/init',{method:'POST',json:{filename:file.name,size:file.size,contentType:file.type||'application/octet-stream'}});
for(let offset=0,partNumber=1;offset<file.size;offset+=chunkSize,partNumber++){
const part=file.slice(offset,Math.min(offset+chunkSize,file.size));const res=await api(`/api/upload/part?key=${encodeURIComponent(upload.key)}&uploadId=${encodeURIComponent(upload.uploadId)}&partNumber=${partNumber}`,{method:'POST',body:part,headers:{'Content-Type':'application/octet-stream'}});parts.push({partNumber,etag:res.etag});const percent=Math.round(Math.min(100,((offset+part.size)/file.size)*100));$('progressFill').style.width=percent+'%';$('progressText').textContent=`Se încarcă... ${percent}% (${partNumber} părți)`;
}
const finalKey=upload.key;await api('/api/upload/complete',{method:'POST',json:{key:upload.key,uploadId:upload.uploadId,parts}});upload=null;
let subtitles=[];const subfile=$('subtitleFile').files[0];if(subfile){if(subfile.size>350000)throw Error('Subtitrarea depășește limita de 350 KB.');subtitles=[{lang:'ro',label:'Română',text:await subfile.text()}];}
const poster=$('posterUrl').value.trim()||await makeThumbnail(file);const duration=await probeVideo(file);
const {error}=await client.from('cinema_films').insert({owner_id:status.user.id,title,year:Number($('movieYear').value)||null,r2_key:finalKey,file_size:file.size,mime_type:file.type||'video/mp4',duration_s:duration,poster_url:poster,subtitles});
// key is saved separately because the upload session is no longer needed after completion.
if(error)throw error;
$('uploadForm').reset();$('progressFill').style.width='0%';$('dropTitle').textContent='Alege un fișier video';$('uploadModal').classList.add('hidden');await loadFilms();toast('Film încărcat în bibliotecă!');
}catch(err){if(upload?.key){api('/api/upload/abort',{method:'POST',json:{key:upload.key,uploadId:upload.uploadId}}).catch(()=>{});}console.error(err);toast(err.message,true);}finally{status.busy=false;$('submitUpload').disabled=false;$('cancelUpload').disabled=false;$('closeUpload').disabled=false;$('uploadProgress').classList.add('hidden');}
}

async function localPlay(file){
 if(!file)return;
 if(!file.size)throw Error('Fișierul video este gol.');
 const oldUrl=status.localUrl;
 status.localUrl=URL.createObjectURL(file);
 setView('screen');
 try{await loadPlayer({id:'local',title:file.name.replace(/\.[^.]+$/,''),mime_type:file.type||'video/local',localSource:status.localUrl,subtitles:[]},true);}
 finally{if(oldUrl)URL.revokeObjectURL(oldUrl);}
 toast('Filmul rulează direct de pe dispozitiv. Nu este încărcat în cloud.');
}
async function importLocalSubtitle(file){
 if(!file)return;
 if(!status.current)throw Error('Deschide mai întâi un film.');
 if(!/\.(srt|vtt)$/i.test(file.name))throw Error('Subtitrarea trebuie să fie SRT sau VTT.');
 if(file.size>1024*1024)throw Error('Subtitrarea depășește 1 MB.');
 const contents=await file.text();
 const subtitles=[...(status.current.subtitles||[])];
 subtitles.push({label:file.name,lang:'ro',text:contents});
 status.current.subtitles=subtitles;
 setSubtitleOptions(status.current);
 const index=subtitles.length-1;
 $('subtitleSelect').value=String(index);
 status.currentSub=String(index);
 status.cues=parseSubtitle(contents);
 syncSubtitle();
 toast('Subtitrarea a fost încărcată local.');
}


const projectorStorageKey='cinema-mode-projector-v1';
function storedProjector() {try{return JSON.parse(localStorage.getItem(projectorStorageKey)||'null');}catch(_){return null;}}
function saveProjector(data) {try{localStorage.setItem(projectorStorageKey,JSON.stringify(data));}catch(_){}}
async function deviceRequest(path,{method='POST',json,authorized=true}={}) {
 const headers={};
 if(authorized){if(!status.deviceToken)throw Error('Proiectorul nu are încă un cod de asociere.');headers.Authorization='Device '+status.deviceToken;}
 if(json!==undefined)headers['Content-Type']='application/json';
 const r=await fetch(path,{method,headers,body:json!==undefined?JSON.stringify(json):undefined,cache:'no-store'});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(data.error||'Nu se poate contacta Cinema Mode ('+r.status+').');
 return data;
}
function showProjectorCode(code) {
 $('projectorPairCode').textContent=code?code.slice(0,4)+' '+code.slice(4):'•••• ••••';
}
function projectorMessage(message){$('projectorPairStatus').textContent=message;}
async function makeProjectorPairing() {
 projectorMessage('Generăm un cod temporar...');
 const headers={'Content-Type':'application/json'};
 if(status.deviceToken)headers.Authorization='Device '+status.deviceToken;
 const res=await fetch('/api/device/start',{method:'POST',headers,body:JSON.stringify({name:'Proiector Cinema'}),cache:'no-store'});
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Error(data.error||'Nu pot genera codul de asociere ('+res.status+').');
 status.deviceToken=data.deviceToken||status.deviceToken;
 status.devicePairCode=data.pairingCode;
 status.devicePaired=false;
 saveProjector({token:status.deviceToken,code:status.devicePairCode,expiresAt:data.expiresAt});
 $('projectorGate').classList.remove('hidden');$('shell').classList.add('hidden');
 showProjectorCode(status.devicePairCode);
 projectorMessage('Cod valabil 10 minute · Aștept aprobarea de pe laptop...');
}
async function initializeProjector() {
 status.deviceMode=true;
 document.body.classList.add('projector-mode');
 $('auth').classList.add('hidden');
 $('projectorGate').classList.remove('hidden');
 $('shell').classList.add('hidden');
 let saved=storedProjector();
 if(saved?.token&&/^[0-9a-f]{64}$/.test(saved.token)){
   status.deviceToken=saved.token;
   status.devicePairCode=saved.code;
   if(saved.code&&Date.parse(saved.expiresAt)>Date.now())showProjectorCode(saved.code);
   projectorMessage('Verificăm asocierea salvată...');
 }else await makeProjectorPairing();
 await projectorPoll();
 clearInterval(deviceInterval);
 deviceInterval=setInterval(()=>projectorPoll().catch(err=>console.warn('Projector:',err)),2500);
}
async function projectorPoll() {
 if(devicePollBusy||!status.deviceToken)return;
 devicePollBusy=true;
 try {
   const data=await deviceRequest('/api/device/poll');
   if(data.state==='pending') {
     if(!status.devicePairCode||Date.parse(data.expiresAt)<Date.now()) {projectorMessage('Codul anterior nu mai este disponibil. Apasă „Generează cod nou”.');showProjectorCode('');}
     else projectorMessage('Aștept aprobarea de pe laptop. Codul expiră în aproximativ '+Math.max(1,Math.ceil((Date.parse(data.expiresAt)-Date.now())/60000))+' minute.');
     return;
   }
   if(data.state==='expired') {showProjectorCode('');projectorMessage('Cod expirat. Apasă „Generează cod nou”.');return;}
   if(data.state!=='paired')return;
   status.devicePaired=true;
   if(!deviceReady) {
     deviceReady=true;
     status.devicePairCode=null;
     saveProjector({token:status.deviceToken});
     $('projectorGate').classList.add('hidden');
     $('shell').classList.remove('hidden');
     $('userEmail').textContent='PROIECTOR ASOCIAT';
     setView('screen');
     $('playingTitle').textContent='Proiector conectat · alege filmul pe laptop';
     toast('Proiector asociat! Controlează redarea din laptop.',false);
   }
   for(const cmd of (data.commands||[])) {
     try {
       if(cmd.action==='load'&&!cmd.film)toast('Filmul trimis nu mai există în bibliotecă.',true);
       else await applyCommand(cmd);
     }catch(err){console.error('Comandă proiector',err);toast(err.message||'Nu pot reda filmul',true);}
     await deviceRequest('/api/device/ack',{json:{lastCommandId:cmd.id}});
   }
 }catch(err){
   console.warn('Proiector:',err);
   if(/revocat|nu are o asociere validă|nu există|403|401/i.test(err.message)){
     deviceReady=false;status.devicePaired=false;status.deviceToken=null;
     $('shell').classList.add('hidden');$('projectorGate').classList.remove('hidden');
     showProjectorCode('');projectorMessage('Accesul acestui proiector este indisponibil sau revocat. Generează cod nou.');
   }else{
     if(!deviceReady)projectorMessage(err.message);
     else toast('Conexiune proiector: '+err.message,true);
   }
 }finally{devicePollBusy=false;}
}
async function approveProjector(event) {
 event.preventDefault();
 const code=$('devicePairCode').value.toUpperCase().replace(/[-\s]/g,'');
 if(code.length!==8)return toast('Codul trebuie să aibă 8 caractere.',true);
 const button=$('pairDeviceSubmit');button.disabled=true;
 try{
   const result=await api('/api/device/approve',{method:'POST',json:{code}});
   $('devicePairCode').value='';
   toast('Proiectorul '+result.device.device_name+' a fost asociat!');
   await listProjectors();
 }catch(e){toast(e.message,true);}finally{button.disabled=false;}
}
async function listProjectors(){
 if(!status.user||status.guest)return;
 const data=await api('/api/device/list');
 const list=$('pairedDeviceList');
 if(!data.devices?.length){list.innerHTML='<span class="pair-empty">Nu ai încă niciun proiector asociat.</span>';return;}
 list.innerHTML=data.devices.map(d=>{
   const active=d.last_seen_at&&(Date.now()-Date.parse(d.last_seen_at)<60000);
   return '<div class="paired-device"><div class="paired-symbol">▣</div><div><strong>'+escapeHtml(d.device_name)+'</strong><small>'+(active?'● Conectat recent':'○ Offline sau în așteptare')+'</small></div><button type="button" data-revoke-device="'+escapeHtml(d.id)+'" class="secondary-button">Revocă</button></div>';
 }).join('');
}
async function revokeProjector(id){
 if(!window.confirm('Revoci accesul acestui proiector? Va trebui asociat din nou.'))return;
 await api('/api/device/revoke',{method:'POST',json:{id}});
 toast('Accesul proiectorului a fost revocat.');
 await listProjectors();
}

function wireEvents(){ $('projectorModeButton').addEventListener('click',()=>location.assign('/?mode=projector'));$('projectorRenew').addEventListener('click',()=>runSafe(makeProjectorPairing));$('pairDeviceForm').addEventListener('submit',approveProjector);$('refreshProjectors').addEventListener('click',()=>runSafe(listProjectors));$('pairedDeviceList').addEventListener('click',event=>{const button=event.target.closest('[data-revoke-device]');if(button)runSafe(()=>revokeProjector(button.dataset.revokeDevice));}); $('loginForm').addEventListener('submit',signIn);$('registerBtn').addEventListener('click',()=>runSafe(register));$('guestLocalButton').addEventListener('click',enterGuest);$('logoutBtn').addEventListener('click',()=>runSafe(logout));document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>setView(el.dataset.view)));for(const id of ['addMovieButton','emptyUploadBtn'])$(id).addEventListener('click',showUpload);$('closeUpload').addEventListener('click',closeUpload);$('cancelUpload').addEventListener('click',closeUpload);$('videoFile').addEventListener('change',e=>{const f=e.target.files[0];if(f){$('dropTitle').textContent=f.name;if(!$('movieTitle').value)$('movieTitle').value=f.name.replace(/\.[^.]+$/,'').replace(/[._-]/g,' ');}});$('uploadForm').addEventListener('submit',uploadFilm);$('searchInput').addEventListener('input',drawFilms);$('refreshBtn').addEventListener('click',()=>runSafe(loadFilms));$('playLocalButton').addEventListener('click',()=>$('localFileInput').click());$('screenLocalButton').addEventListener('click',()=>$('localFileInput').click());$('localSubtitleButton').addEventListener('click',()=>$('localSubtitleFileInput').click());$('localSubtitleFileInput').addEventListener('change',e=>runSafe(()=>importLocalSubtitle(e.target.files[0])));$('localFileInput').addEventListener('change',e=>runSafe(()=>localPlay(e.target.files[0])));$('filmGrid').addEventListener('click',e=>{const card=e.target.closest('[data-film]');if(card)runSafe(async()=>{setView('screen');await loadPlayer(status.films.find(f=>f.id===card.dataset.film),true);});});$('remoteList').addEventListener('click',e=>{const card=e.target.closest('[data-remote-film]');if(card)runSafe(()=>issueCommand('load',card.dataset.remoteFilm));});$('fullscreenBtn').addEventListener('click',()=>{const box=$('playerBox');if(!document.fullscreenElement){box.requestFullscreen?.().catch(()=>toast('Fullscreen indisponibil',true));}else document.exitFullscreen?.();});$('subtitleSelect').addEventListener('change',e=>{status.currentSub=e.target.value;const subs=Array.isArray(status.current?.subtitles)?status.current.subtitles:[];status.cues=status.currentSub==='off'?[]:parseSubtitle(subs[Number(status.currentSub)]?.text||'');syncSubtitle();});$('subtitleOffset').addEventListener('input',e=>{status.offset=Number(e.target.value)||0;syncSubtitle();});$('subtitleSize').addEventListener('change',e=>{$('subtitleOverlay').className='subtitle-overlay '+e.target.value;});$('remoteBack').addEventListener('click',()=>runSafe(()=>issueCommand('skip',null,-15)));$('remoteForward').addEventListener('click',()=>runSafe(()=>issueCommand('skip',null,15)));$('remotePause').addEventListener('click',()=>runSafe(()=>issueCommand('toggle')));$('remoteStop').addEventListener('click',()=>runSafe(()=>issueCommand('stop')));$('remoteSeek').addEventListener('change',e=>runSafe(()=>issueCommand('seek',null,Number(e.target.value)))); const v=video();v.addEventListener('timeupdate',()=>{syncSubtitle();if(Date.now()-status.lastStateSent>5000){status.lastStateSent=Date.now();sendState().catch(()=>{});}});for(const event of ['play','pause','seeked','loadedmetadata','ended'])v.addEventListener(event,()=>{syncSubtitle();sendState().catch(()=>{});});v.addEventListener('error',()=>{if(v.error?.code===4)toast('Format sau codec incompatibil. Încearcă MP4 H.264/AAC sau HDMI + VLC.',true);});}
async function initialize(){wireEvents();if(new URLSearchParams(location.search).get('mode')==='projector'){await initializeProjector();return;}if(!client){toast('Modul USB/local este disponibil. Pentru biblioteca cloud configurează Supabase.');return;}const {data}=await client.auth.getUser();if(data?.user)await start(data.user);}
initialize().catch(e=>toast(e.message,true));
