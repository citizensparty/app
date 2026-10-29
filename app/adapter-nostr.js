// Nostr adapter: provides the window.claude API the app calls, backed by member-run hosts (Nostr relays).
// - Your identity is a key on this device (no username, no password). 12 words restore it anywhere.
// - Every record is a signed event (kind 30078, d = doc path, c = collection). The app checks every signature
//   and who is allowed to write each path, so a host can't forge or change anything.
// - Records go to every host. The app reads (and checks) the record but doesn't keep it: hosts keep it and copy from
//   each other. The phone keeps only this member's own records, and resends those to a host that lost them.
// - New keys ask to join; a registrar approves them; until then the hosts accept only the join request.
// Falls back to the local demo adapter when the party has no hosts yet, or with ?demo in the address.
(function(){
const N=window.CPNostr,LOCAL=window.claude&&window.claude.__local?window.claude:null;
if(!N)return;
if(window.claude&&!LOCAL)return; // a test runtime (tests/mock.js) is in charge
const KIND=30078,AUTH=22242;
const BUILD=window.CP_BUILD||{owners:[],hosts:[]};
const qs=new URLSearchParams(location.search);
const clone=o=>o==null?o:JSON.parse(JSON.stringify(o));
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const nowS=()=>Math.floor(Date.now()/1000);
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};

// ---------- secret key storage: Keychain/Keystore in the native app, IndexedDB in the browser ----------
const SEC=(()=>{
  // @aparajita/capacitor-secure-storage (iOS Keychain / Android Keystore); without a bundler we call its raw methods
  const P=window.Capacitor&&window.Capacitor.Plugins;const ss=P&&P.SecureStorage;
  if(ss)return{async get(k){try{const r=await ss.internalGetItem({prefixedKey:"citizens."+k});return r&&r.data!=null?r.data:null}catch(e){return null}},
    async set(k,v){await ss.internalSetItem({prefixedKey:"citizens."+k,data:v,sync:false})},async del(k){try{await ss.internalRemoveItem({prefixedKey:"citizens."+k})}catch(e){}}};
  const open=()=>new Promise(res=>{try{const r=indexedDB.open("citizens-id",1);r.onupgradeneeded=()=>r.result.createObjectStore("k");r.onsuccess=()=>res(r.result);r.onerror=()=>res(null)}catch(e){res(null)}});
  const op=(mode,fn)=>open().then(db=>new Promise(res=>{if(!db)return res(null);try{const tx=db.transaction("k",mode);const r=fn(tx.objectStore("k"));tx.oncomplete=()=>res(r&&r.result);tx.onerror=()=>res(null)}catch(e){res(null)}}));
  return{get:k=>op("readonly",s=>s.get(k)),set:(k,v)=>op("readwrite",s=>s.put(v,k)),del:k=>op("readwrite",s=>s.delete(k))};
})();

// ---------- party config: who the owners, registrars and hosts are ----------
let party={hosts:BUILD.hosts||[],registrars:[],at:0};
const owners=new Set((BUILD.owners||[]).map(x=>x.toLowerCase()));
// The installed app (BUILD.remote) reads the signed party settings from citizensparty.ca. The party's public key
// is built in, so a hijacked website can't swap it; an app built without one reads it from the site (and caches it).
const REMOTE=!!BUILD.remote;
// the party's website: citizensparty.ca unless the member points the app somewhere else (Hosts screen), e.g. if the
// address is ever lost. The settings must still be signed by the party key built into the app.
const SITE_DEFAULT=(BUILD.directory||"https://citizensparty.ca").replace(/\/$/,"");
const SITE=(lsGet("citizens-site")||SITE_DEFAULT).replace(/\/$/,"");
const KEY_FROM_SITE=REMOTE&&!owners.size;
if(KEY_FROM_SITE){try{for(const k of JSON.parse(lsGet("citizens-owners")||"[]"))owners.add(k)}catch(e){}}
function takeParty(ev){
  if(!ev||!owners.has(ev.pubkey)||!N.verifyEvent(ev))return false;
  let c;try{c=JSON.parse(ev.content)}catch(e){return false}
  if((c.at||0)<(party.at||0))return false;
  party={hosts:c.hosts||[],registrars:(c.registrars||[]).map(x=>x.toLowerCase()),at:c.at||0,ev};
  lsSet("citizens-party",JSON.stringify(ev));return true;
}
try{takeParty(JSON.parse(lsGet("citizens-party")||"null"))}catch(e){}
const ownersReady=KEY_FROM_SITE?fetch(SITE+"/app/config.json",{cache:"no-cache"}).then(r=>r.ok?r.json():null).then(c=>{
    const ks=(c&&c.owners||[]).map(x=>String(x).toLowerCase()).filter(x=>/^[0-9a-f]{64}$/.test(x));
    if(ks.length){owners.clear();ks.forEach(k=>owners.add(k));lsSet("citizens-owners",JSON.stringify(ks));try{takeParty(JSON.parse(lsGet("citizens-party")||"null"))}catch(e){}}
  }).catch(()=>{}):Promise.resolve();
const partyReady=ownersReady.then(()=>fetch(REMOTE?SITE+"/app/party.json":"party.json",{cache:"no-cache"})).then(r=>r.ok?r.json():null).then(takeParty).catch(()=>false);
// the host directory at citizensparty.ca (the front door); if it's unreachable, the record's own host list still works
const DIR=SITE;
function takeDir(j){let n=0;for(const h of (j&&j.hosts)||[]){const e=h&&h.ev;if(e&&e.pubkey===h.pubkey&&ingest(e,null))n++}return n}
let dirAt=0;function refreshDir(){if(Date.now()-dirAt<20000)return;dirAt=Date.now();return fetch(DIR+"/hosts.json",{cache:"no-cache"}).then(r=>r.ok?r.json():null).then(j=>{if(j){lsSet("citizens-dir",JSON.stringify(j));if(takeDir(j))setTimeout(fillHosts,0)}return j}).catch(()=>null)}
const dirReady=(()=>{let cached=null;try{cached=JSON.parse(lsGet("citizens-dir")||"null")}catch(e){}
  const live=refreshDir();
  return Promise.race([live,new Promise(r=>setTimeout(()=>r(null),4000))]).then(j=>j||cached)})();

// ---------- event store and access rules ----------
const evs=new Map();           // pubkey|d -> newest event from that author for that path
const byD=new Map();           // d -> Set of keys
const seenOn=new Map();        // relay url -> Set of event ids it has sent us
const newer=(a,b)=>{const ma=+(tagOf(a,"ms")||0),mb=+(tagOf(b,"ms")||0);if(a.created_at!==b.created_at)return a.created_at>b.created_at;if(ma!==mb)return ma>mb;return a.id<b.id};
function tagOf(e,n){const t=(e.tags||[]).find(t=>t[0]===n);return t?t[1]:null}
function isRegistrar(pk){return owners.has(pk)||party.registrars.includes(pk)}
let regCache=null;
function approvals(){if(regCache)return regCache;const best={};
  for(const [k,e] of evs){if(tagOf(e,"c")!=="reg"||!isRegistrar(e.pubkey))continue;const who=tagOf(e,"d").slice(4);if(!best[who]||newer(e,best[who]))best[who]=e}
  const out={};for(const who in best){try{const c=JSON.parse(best[who].content);if(c.ok)out[who]=Object.assign({by:best[who].pubkey},c)}catch(e){}}
  return regCache=out}
const isMember=pk=>owners.has(pk)||party.registrars.includes(pk)||!!approvals()[pk];
// Who may write each path. The party key (owner) only signs the settings and approves members, like a registrar;
// it can never write another member's records. The hosts enforce the same rules (host/store.go, WriteError).
function mayWrite(pk,d,e){
  const c=d.split("/")[0],rest=d.slice(c.length+1);
  if(c==="config")return false; // vote rules are fixed in the app now, not settings (Oct 28)
  if(c==="party")return owners.has(pk);
  if(c==="reg"||c==="stampok")return isRegistrar(pk);
  if(c==="stampkeys")return isRegistrar(pk)&&rest.startsWith(pk+"_");
  if(c==="join"||c==="hosts")return rest===pk; // a join request, or a host announcing itself
  // a voting key isn't a member key: it may write its own stamp (if the stamp checks out) and its own ballots
  if(c==="stamps")return rest===pk&&!!e&&stampOk(e);
  if(c==="ballots")return rest.startsWith(pk+"_")&&hasStamp(pk);
  if(!isMember(pk))return false;
  if(c==="members"||c==="turnout")return rest===pk;
  if(c==="items"||c==="meetings")return rest.startsWith(pk.slice(0,16)+"-"); // a proposal's id starts with its author's key
  if(c==="stampreq")return rest.startsWith(pk+"_");
  return c==="ends"||c==="chain"||c==="chainlock";
}
// These are written once: the first version of the path wins, and later versions, from anyone, are ignored.
// chain = pages of the vote record; items = proposals (nobody can reword one, not even its author);
// ends = when a vote closed early or was voided (each app checks it before believing it); meetings = team meeting links.
const firstWins=d=>/^(chain|items|ends|meetings|stampkeys|stampreq|stampok|stamps|ballots)\//.test(d);
const better=(d,a,b)=>firstWins(d)?newer(b,a):newer(a,b); // should a replace b as the current version of d?
// The record starts at RECORD_START (the end of the first test phase, Oct 26, 2026), fixed here and in the host program:
// no key, not even the party's, can move it. Older votes and proposals are ignored and dropped from this phone, its copy
// and its outbox, so it never sends them back to a host.
const RECORD_START=1793066261;
const CLEARED=new Set(["items","ballots","turnout","ends","chain","chainlock","meetings"]);
const isCleared=e=>e.created_at<RECORD_START&&CLEARED.has(tagOf(e,"c"));
// The version of the record's rules, on every record (tag "p"). Records for another version are ignored; records from
// before the label (Oct 28, 2026) count as version 1. Same in the host program (Protocol in host/store.go).
const PROTOCOL="1";
const otherProtocol=e=>{const p=tagOf(e,"p");return p!==null&&p!==PROTOCOL};
function ingest(e,url){
  if(!e||e.kind!==KIND||typeof e.id!=="string")return false;
  const d=tagOf(e,"d"),c=tagOf(e,"c");if(!d||!c||!d.startsWith(c+"/"))return false;
  if(isCleared(e)||otherProtocol(e))return false;
  if(url){let s=seenOn.get(url);if(!s)seenOn.set(url,s=new Set());s.add(e.id)}
  const k=e.pubkey+"|"+d,cur=evs.get(k);
  if(cur&&(cur.id===e.id||!better(d,e,cur)))return false;
  if(!N.verifyEvent(e)){if(url)flag(url,"sent a forged record",FLAG_AT);return false}
  if(c==="hosts")setTimeout(fillHosts,0);
  if(c==="party"){takeParty(e);regCache=null}
  evs.set(k,e);let s=byD.get(d);if(!s)byD.set(d,s=new Set());s.add(k);COPY.put(k,e);
  if(c==="reg")regCache=null;
  return true;
}
function docEvent(d){const s=byD.get(d);if(!s)return null;let best=null;for(const k of s){const e=evs.get(k);if(e&&mayWrite(e.pubkey,d,e)&&(!best||better(d,e,best)))best=e}return best}
function docVal(d){const e=docEvent(d);if(!e)return undefined;try{const v=JSON.parse(e.content);return v&&v._del?undefined:v}catch(x){return undefined}}
function collPaths(c){const out=[];for(const d of byD.keys())if(d.startsWith(c+"/")&&!d.slice(c.length+1).includes("/"))out.push(d);return out}

// ---------- what this phone keeps (Oct 28, the user's call: an app is not a host) ----------
// Only this member's own records (and their voting keys'), their approval, the party settings and the host list, so the
// app knows it's a member and still finds the hosts if the website is gone. Everything else is read from the hosts.
function myKeys(){const m=new Set();if(!sk)return m;m.add(me);let P=periodOf(Date.now());for(let i=0;i<5;i++){m.add(vpkOf(P));const y=+P.slice(0,4),q=+P.slice(5);P=q===1?(y-1)+"Q4":y+"Q"+(q-1)}return m}
let mineCache=null;const always=e=>{const c=tagOf(e,"c");if(c==="party"||c==="hosts")return true;if(c==="reg")return !!me&&tagOf(e,"d")==="reg/"+me;if(!sk)return false;if(!mineCache)mineCache=myKeys();return mineCache.has(e.pubkey)};
const COPY=(()=>{const open=()=>new Promise(res=>{try{const r=indexedDB.open("citizens-copy",1);r.onupgradeneeded=()=>r.result.createObjectStore("ev");r.onsuccess=()=>res(r.result);r.onerror=()=>res(null)}catch(e){res(null)}});
  let dbp=null;const get=()=>dbp||(dbp=open());let dirty=new Map(),t=null;
  return{
    async load(){const db=await get();if(!db)return 0;return new Promise(res=>{try{const r=db.transaction("ev","readwrite").objectStore("ev").openCursor();let n=0;r.onsuccess=()=>{const c=r.result;if(c){const e=c.value;const k=e.pubkey+"|"+tagOf(e,"d");if(isCleared(e)){try{c.delete()}catch(x){}n++;c.continue();return}if(!evs.has(k)||better(tagOf(e,"d"),e,evs.get(k))){evs.set(k,e);const d=tagOf(e,"d");let s=byD.get(d);if(!s)byD.set(d,s=new Set());s.add(k);if(tagOf(e,"c")==="party")takeParty(e)}n++;c.continue()}else{regCache=null;res(n)}};r.onerror=()=>res(n)}catch(e){res(0)}})},
    del(k){dirty.delete(k);get().then(db=>{if(!db)return;try{db.transaction("ev","readwrite").objectStore("ev").delete(k)}catch(x){}})},
    put(k,e){if(!always(e))return;dirty.set(k,e);if(t)return;t=setTimeout(async()=>{t=null;const db=await get();if(!db)return;const batch=dirty;dirty=new Map();try{const tx=db.transaction("ev","readwrite");const os=tx.objectStore("ev");for(const [k,e] of batch)os.put(e,k)}catch(x){}},400)},
    // start again with only what's kept (phones that kept a full copy before Oct 28)
    async reset(){const db=await get();if(db){try{db.close()}catch(e){}}dbp=null;
      await new Promise(res=>{try{const r=indexedDB.deleteDatabase("citizens-copy");r.onsuccess=r.onerror=r.onblocked=()=>res()}catch(e){res()}});
      for(const [k,e] of evs)this.put(k,e)}
  }})();

// ---------- identity ----------
let sk=null,me=null;
const hexToBytes=N.hexToBytes,bytesToHex=N.bytesToHex;
async function loadKey(){const h=await SEC.get("citizens-sk");if(h&&/^[0-9a-f]{64}$/.test(h)){sk=hexToBytes(h);me=N.getPublicKey(sk);return true}return false}
// The 12 words are kept next to the key (same protection) so "Add a device" can show them.
async function saveWords(w){const b=N.privateKeyFromSeedWords(w);await SEC.set("citizens-sk",bytesToHex(b));await SEC.set("citizens-words",w);sk=b;me=N.getPublicKey(sk)}
const getWords=()=>SEC.get("citizens-words");
function signEv(tmpl){return N.finalizeEvent(tmpl,sk)}

// ---------- relay pool ----------
const relays=new Map();        // url -> {ws, ok, authed, queue, subs}
const subs=new Map();          // sid -> {filter, eose:Set(url)}
let sidN=0;
const listeners=[];
let notifyT=null;
function notify(){if(notifyT)return;notifyT=setTimeout(()=>{notifyT=null;listeners.slice().forEach(l=>{try{l()}catch(e){console.error(e)}})},15)}
// ---------- choosing hosts ----------
// The party's own hosts (in the signed party config) are the starting point. Every other host announces itself in
// the record (hosts/<its key>), after the other hosts have checked it. The app stays connected to WANT hosts, tests
// each one itself, and stops using a host for a day after FLAG_AT strikes. It never takes another app's word for it.
const WANT=5,FLAG_AT=3,BENCH_MS=24*3600e3,STALE_S=7*24*3600;
let health={};try{health=JSON.parse(lsGet("citizens-host-health")||"{}")}catch(e){}
for(const u in health)if(health[u].why==="couldn't be reached"){health[u].until=0;health[u].fails=0} // older apps benched hosts that were only restarting
const saveHealth=()=>lsSet("citizens-host-health",JSON.stringify(health));
const hp=url=>health[url]||(health[url]={fails:0,until:0,ok:0,why:""});
function flag(url,why,n){const h=hp(url);h.fails+=n||1;h.why=why;if(h.fails>=FLAG_AT){h.until=Date.now()+BENCH_MS;h.fails=0;saveHealth();drop(url);return}saveHealth();notifyHosts()}
function good(url){const h=hp(url);h.fails=0;h.until=0;h.ok=Date.now();h.why="";saveHealth()}
const benched=url=>hp(url).until>Date.now();
const okUrl=u=>typeof u==="string"&&u.length<=200&&(/^wss:\/\/[^\s/?#]+\/?$/.test(u)||(location.protocol==="http:"&&/^ws:\/\/[^\s/?#]+\/?$/.test(u)));
function seedUrls(){const u=(party.hosts||[]).map(h=>h.url).filter(Boolean);const extra=(lsGet("citizens-extra-hosts")||"").split(",").filter(Boolean);return [...new Set(u.concat(extra))]}
const okOnion=u=>typeof u==="string"&&/^ws:\/\/[a-z2-7]{56}\.onion$/.test(u);
function announced(){const out=[];const old=nowS()-STALE_S;for(const d of collPaths("hosts")){const e=docEvent(d),v=docVal(d);if(e&&v&&okUrl(v.url)&&e.created_at>old)out.push({url:v.url,name:v.name||"",pk:e.pubkey,onion:okOnion(v.onion)?v.onion:""})}return out}
const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
function candidates(){const seeds=shuffle(seedUrls());const rest=shuffle(announced().map(h=>h.url).filter(u=>!seeds.includes(u))).sort((a,b)=>(hp(b).ok?1:0)-(hp(a).ok?1:0));
  return [...new Set(seeds.concat(rest))].filter(u=>!benched(u))}
function hostUrls(){return [...relays.keys()]}
function fillHosts(){if(!started)return;for(const u of candidates()){if(relays.size>=WANT)break;if(!relays.has(u))connect(u)}
  if(![...relays.values()].some(r=>r.ok)&&relays.size<WANT)for(const u of seedUrls().concat(announced().map(h=>h.url))){if(relays.size>=WANT)break;if(!relays.has(u))connect(u)} // never end up with no hosts at all, benched or not
  notifyHosts()}
function drop(url){const r=relays.get(url);if(!r)return;relays.delete(url);try{r.ws&&r.ws.close()}catch(e){}seenOn.delete(url);for(const x of subs.values())x.eose.delete(url);for(const p of r.pendingOk.values())p(false,"disconnected");r.pendingOk.clear();setTimeout(fillHosts,0)}
function connectAll(){fillHosts()}
// After a host has sent everything it has: it should hold about as much as the best other host.
function testHost(r){const have=(seenOn.get(r.url)||new Set()).size;let best=0;const s=[...subs.values()];
  for(const [u,ids] of seenOn)if(u!==r.url&&s.every(x=>x.eose.has(u)))best=Math.max(best,ids.size);
  if(best>=20&&have<best*0.5)flag(r.url,"was missing most of the record");else good(r.url)}
function connect(url){
  const r={url,ws:null,ok:false,authed:false,queue:[],pendingOk:new Map(),tries:(relays.get(url)||{}).tries||0,last:0,err:""};
  relays.set(url,r);
  let ws;try{ws=new WebSocket(url)}catch(e){r.err="bad address";return}
  r.ws=ws;
  ws.onopen=()=>{r.ok=true;r.opened=true;r.tries=0;for(const [sid,s] of subs)ws.send(JSON.stringify(["REQ",sid,s.filter]));flushOutbox(r);notifyHosts()};
  ws.onmessage=m=>{let a;try{a=JSON.parse(m.data)}catch(e){return}r.last=Date.now();
    if(a[0]==="EVENT"&&a[2]){if(ingest(a[2],url))notify()}
    else if(a[0]==="EOSE"){const s=subs.get(a[1]);if(s){s.eose.add(url);if(s.onEose)s.onEose(url)}if([...subs.values()].every(x=>x.eose.has(url))&&!r.tested){r.tested=true;testHost(r)}repair(r)}
    else if(a[0]==="AUTH"&&sk){const ev=signEv({kind:AUTH,created_at:nowS(),tags:[["relay",url],["challenge",a[1]]],content:""});ws.send(JSON.stringify(["AUTH",ev]));r.authId=ev.id}
    else if(a[0]==="OK"){if(a[1]===r.authId){r.authed=!!a[2];if(r.authed&&/^auth-required/.test(r.err||""))r.err="";notifyHosts();return}const p=r.pendingOk.get(a[1]);if(p){r.pendingOk.delete(a[1]);p(a[2],a[3]||"")}}
    else if(a[0]==="NOTICE"||a[0]==="CLOSED"){r.err=String(a[a.length-1]||"")}
  };
  ws.onclose=()=>{if(relays.get(url)!==r)return;r.ok=false;r.authed=false;seenOn.delete(url);for(const x of subs.values())x.eose.delete(url);for(const p of r.pendingOk.values())p(false,"disconnected");r.pendingOk.clear();notifyHosts();
    if(!r.opened){r.err="couldn't be reached";if(r.tries>=4&&candidates().some(u=>!relays.has(u))){relays.delete(url);setTimeout(fillHosts,0);return}} // try another host if there is one
    const wait=Math.min(60000,1000*Math.pow(2,r.tries++));setTimeout(()=>{if(relays.get(url)===r)connect(url)},wait)};
  ws.onerror=()=>{r.err="unreachable"};
}
function subscribe(filter,onEose){const sid="s"+(++sidN);const s={filter,eose:new Set(),onEose};subs.set(sid,s);for(const r of relays.values())if(r.ok)r.ws.send(JSON.stringify(["REQ",sid,filter]));return s}
// outbox: our own events wait here until every host has them (survives reloads)
let outbox=[];try{outbox=JSON.parse(lsGet("citizens-outbox")||"[]")}catch(e){}
const saveOutbox=()=>lsSet("citizens-outbox",JSON.stringify(outbox.slice(-500)));
function sendTo(r,ev){return new Promise(res=>{if(!r.ok)return res([false,"offline"]);r.pendingOk.set(ev.id,(ok,msg)=>res([ok,msg]));try{r.ws.send(JSON.stringify(["EVENT",ev]))}catch(e){r.pendingOk.delete(ev.id);res([false,"offline"])}
  setTimeout(()=>{if(r.pendingOk.has(ev.id)){r.pendingOk.delete(ev.id);flag(r.url,"didn't answer when sent a record");res([false,"timeout"])}},8000)})}
async function flushOutbox(r){for(const ev of outbox.slice()){const have=seenOn.get(r.url);if(have&&have.has(ev.id))continue;const [ok,msg]=await sendTo(r,ev);if(ok){let s=seenOn.get(r.url);if(!s)seenOn.set(r.url,s=new Set());s.add(ev.id)}else if(/^(blocked|invalid)/.test(msg)){outbox=outbox.filter(x=>x.id!==ev.id);saveOutbox()}}
  outbox=outbox.filter(ev=>![...relays.values()].every(x=>x.ok&&seenOn.get(x.url)&&seenOn.get(x.url).has(ev.id)));saveOutbox()}
async function publish(ev){
  ingest(ev,null);notify();outbox.push(ev);saveOutbox();
  const live=[...relays.values()].filter(r=>r.ok);
  if(!live.length)return{ok:true,queued:true};
  const res=await Promise.all(live.map(r=>sendTo(r,ev).then(([ok,msg])=>{if(ok){let s=seenOn.get(r.url);if(!s)seenOn.set(r.url,s=new Set());s.add(ev.id)}return[ok,msg]})));
  if(res.some(x=>x[0])){outbox=outbox.filter(x=>![...relays.values()].every(r=>seenOn.get(r.url)&&seenOn.get(r.url).has(x.id)));saveOutbox();return{ok:true}}
  const why=(res.find(x=>/^(blocked|invalid)/.test(x[1]))||res[0])[1];
  if(/^(blocked|invalid)/.test(why)){outbox=outbox.filter(x=>x.id!==ev.id);saveOutbox();throw new Error(why.replace(/^\w+: /,""))}
  return{ok:true,queued:true};
}
// repair: after a host has sent everything it has, give it any of this member's own records it's missing (hosts copy
// everyone else's from each other)
const repairing=new Set();
function repair(r){if(repairing.has(r.url)||!r.ok)return;const s=[...subs.values()];if(!s.every(x=>x.eose.has(r.url)))return;repairing.add(r.url);
  setTimeout(async()=>{const have=seenOn.get(r.url)||new Set();let n=0;
    const order={party:0,reg:1,stampkeys:2,join:3,stamps:4};const all=[...evs.values()].sort((a,b)=>(order[tagOf(a,"c")]??5)-(order[tagOf(b,"c")]??5));
    const mine=new Set();if(sk){let P=periodOf(Date.now());for(let i=0;i<4;i++){mine.add(vpkOf(P));const y=+P.slice(0,4),q=+P.slice(5);P=q===1?(y-1)+"Q4":y+"Q"+(q-1)}}
    for(const e of all){if(have.has(e.id)||e.pubkey!==me||mine.has(e.pubkey))continue; // never pass on our own ballots over a signed-in connection
      const [ok]=await sendTo(r,e);if(ok){have.add(e.id);n++}}
    seenOn.set(r.url,have);r.repaired=(r.repaired||0)+n;repairing.delete(r.url);notifyHosts()},1500)}
const hostListeners=[];function notifyHosts(){hostListeners.forEach(f=>{try{f()}catch(e){}})}
function hostName(url){const h=(party.hosts||[]).find(x=>x.url===url)||announced().find(x=>x.url===url)||{};return h.name||url.replace(/^wss?:\/\//,"")}
function hostStatus(){return hostUrls().map(url=>{const r=relays.get(url)||{};return{url,name:hostName(url),online:!!r.ok,signedIn:!!r.authed,has:(seenOn.get(url)||new Set()).size,repaired:r.repaired||0,err:r.err||"",strikes:hp(url).fails,why:hp(url).why||""}})}
function benchedHosts(){return Object.keys(health).filter(benched).map(url=>({url,name:hostName(url),why:hp(url).why}))}
function disagreements(){const st=hostStatus().filter(h=>h.online);if(st.length<2)return[];const all=new Set();for(const h of st)for(const id of seenOn.get(h.url)||[])all.add(id);
  return st.map(h=>({url:h.url,name:h.name,missing:[...all].filter(id=>!(seenOn.get(h.url)||new Set()).has(id)).length})).filter(x=>x.missing)}

// ---------- the db API the app calls ----------
const lastOwn=new Map();
function stamp(d){const t=nowS(),ms=Date.now()%1000;const p=lastOwn.get(d);let at=t;if(p&&p.at>=t)at=p.at+(p.ms>=ms?1:0);lastOwn.set(d,{at,ms});return{at,ms}}
function docTemplate(d,val){const c=d.split("/")[0];const s=stamp(d);return{kind:KIND,created_at:s.at,tags:[["d",d],["c",c],["p",PROTOCOL],["ms",String(s.ms)]],content:JSON.stringify(val)}}
let joinMode=false,membersSynced=false; // true until a registrar approves this key: member writes become a join request
// The date you joined is when a registrar approved you for that grid. Filling in Find your grid again (as older apps
// made people do) or a lost member record never resets it; moving to another grid still does.
function firstJoined(cell){const a=approvals()[me];return a&&a.cell===cell&&a.at?a.at:0}
function keepJoined(d,val){if(d!=="members/"+me||!val||typeof val!=="object")return val;const t=firstJoined(val.cell);const cur=docVal(d);
  if(t&&val.joinedAt>t&&(!cur||cur.cell===val.cell))return Object.assign({},val,{joinedAt:t});return val}
async function writeDoc(d,val){
  if(!sk)throw new Error("No key on this device.");val=keepJoined(d,val);
  if(joinMode&&d==="members/"+me){const cur=docVal("join/"+me)||{};await publish(signEv(docTemplate("join/"+me,Object.assign({},cur,val,{at:Date.now()}))));pendingJoin=Object.assign({},cur,val);notify();setTimeout(showWaiting,50);return}
  if(joinMode)throw new Error("Waiting for a registrar to approve your key.");
  await publish(signEv(docTemplate(d,val)));
}
let pendingJoin=null;
const wanted=new Set();
function want(c){if(wanted.has(c))return;wanted.add(c);const s=subscribe({kinds:[KIND],"#c":[c]});return s}
function collSynced(c){const s=[...subs.values()].find(x=>x.filter["#c"]&&x.filter["#c"].includes(c));if(!s)return Promise.resolve();
  const online=()=>[...relays.values()].filter(r=>r.ok).map(r=>r.url);
  return new Promise(res=>{const t0=Date.now();const chk=()=>{const o=online();if(!o.length&&Date.now()-t0<1500)return setTimeout(chk,100);if(o.some(u=>s.eose.has(u))||Date.now()-t0>4000)return res();setTimeout(chk,80)};chk()})}
function readDoc(d){if(joinMode&&d==="members/"+me){const j=docVal("join/"+me)||pendingJoin;return j?clone(j):undefined}return clone(docVal(d))}
function snapColl(c){const docs=[];for(const d of collPaths(c)){const v=readDoc(d);if(v!==undefined)docs.push({id:d.slice(c.length+1),data:(x=>()=>clone(x))(v)})}
  if(c==="members"&&joinMode){const j=readDoc("members/"+me);if(j&&!docs.find(x=>x.id===me))docs.push({id:me,data:()=>clone(j)})}return{docs}}
function snapDoc(d){const v=readDoc(d);return{exists:v!==undefined,data:()=>clone(v)}}
function merge(a,b){const c=Object.assign({},a);for(const k in b){const v=b[k];c[k]=(v&&typeof v==="object"&&!Array.isArray(v)&&c[k]&&typeof c[k]==="object"&&!Array.isArray(c[k]))?merge(c[k],v):v}return c}
function query(c,ob,dir,lim){return{orderBy(f,d){return query(c,f,d||"asc",lim)},limit(n){return query(c,ob,dir,n)},
  async get(){want(c);await collSynced(c);let d=snapColl(c).docs;if(ob)d.sort((a,b)=>{const x=a.data()[ob],y=b.data()[ob];return(x<y?-1:x>y?1:0)*(dir==="desc"?-1:1)});if(lim)d=d.slice(0,lim);return{docs:d}}}}
const db={
  collection(c){return Object.assign(query(c),{
    onSnapshot(fn){want(c);let last=null;const l=()=>{const s=snapColl(c);const j=JSON.stringify(s.docs.map(x=>[x.id,x.data()]));if(j===last)return;last=j;fn(s)};listeners.push(l);setTimeout(l,0);return()=>{const i=listeners.indexOf(l);if(i>=0)listeners.splice(i,1)}},
    async add(d){const id=Date.now().toString(36)+Math.random().toString(36).slice(2,8);await writeDoc(c+"/"+id,d);return{id}}})},
  doc(d){const c=d.split("/")[0];return{
    async get(){want(c);await collSynced(c);return snapDoc(d)},
    async set(v){await writeDoc(d,v)},
    async update(v){want(c);await writeDoc(d,merge(readDoc(d)||{},v))},
    async delete(){await writeDoc(d,{_del:1})},
    onSnapshot(fn){want(c);let last=null;const l=()=>{const s=snapDoc(d);const j=JSON.stringify(s.data());if(j===last)return;last=j;fn(s)};listeners.push(l);setTimeout(l,0);return()=>{const i=listeners.indexOf(l);if(i>=0)listeners.splice(i,1)}},
    async acquire(o){const t=Date.now(),cur=readDoc(d);if(cur&&cur.exp>t&&cur.holder!==o.holder)return{acquired:false};
      await writeDoc(d,{holder:o.holder,exp:t+(o.ttlMs||30000)});await new Promise(r=>setTimeout(r,400));const after=readDoc(d);return{acquired:!!after&&after.holder===o.holder}}
  }}
};
const user={
  id:async()=>me,
  isOwner:async()=>owners.has(me),
  can:async()=>true,
  profiles:async ids=>Object.fromEntries(ids.map(i=>[i,{name:i===me?"You":""}]))
};
const downloads={async save(o){const data=typeof o.data==="string"?o.data:JSON.stringify(o.data,null,2);const url=URL.createObjectURL(new Blob([data],{type:o.mimeType||"application/json"}));
  const a=document.createElement("a");a.href=url;a.download=o.filename||"download.json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}};

// ---------- screens shown before the app (no key yet, waiting for approval) ----------
const root=()=>document.getElementById("app");
function screen(html){const el=document.getElementById("cp-ov")||document.body.appendChild(Object.assign(document.createElement("div"),{id:"cp-ov"}));el.className="cp-ov";el.innerHTML='<div class="cp-in">'+html+'</div>';el.scrollTop=0;return el}
function closeScreen(){const el=document.getElementById("cp-ov");if(el)el.remove()}
// the phone's Back button closes an account screen (12 words, another phone, hosts, join requests) and stays on the page
function closeBackable(){const el=document.getElementById("cp-ov");if(el&&el.dataset.back){el.remove();return true}return false}
// Done closes the screen without the tap reaching what's underneath
document.addEventListener("click",e=>{const ov=document.getElementById("cp-ov");if(!ov||!ov.dataset.back)return;const b=e.target.closest("[data-cpa=close]");if(!b||!ov.contains(b))return;e.preventDefault();e.stopPropagation();setTimeout(closeScreen,0)},true);
const brand='<div class="cp-brand">Citizens Party</div>';
function welcome(done){
  const el=screen(brand+'<h1>Welcome back</h1><p class="lede">This device doesn&#39;t have your key. If you&#39;ve joined before, restore it with your 12 words, or scan the code from your other phone.</p>'+
    '<div class="stack"><button class="btn pri block" data-cpa="have">Restore with my 12 words</button><button class="btn block" data-cpa="new">I&#39;m new here</button></div>'+
    '<p class="small muted">New here? Your phone makes a private <b>key</b> that proves it&#39;s you. There are no usernames or passwords, and nobody else, not even the party, has a copy.</p>');
  el.onclick=e=>{const a=e.target.closest("[data-cpa]");if(!a)return;if(a.dataset.cpa==="new")newGate(done,a);else restoreKey(done)};
}
// BETA ONLY (the user's call, Oct 28): at most BETA_DAILY people get new 12 words a day. Before showing new words, the
// app counts the last 24 hours' approvals on a host; at the limit it says "try again tomorrow". Whoever gets words gets
// in, with no waiting line (only the 72-hour wait after setting a grid, waived in the beta). Nothing is reserved, so a
// busy moment can let in a few over the limit. If no host answers, it lets the person through. Remove after the beta.
const BETA_DAILY=100;
function approvalsToday(){const urls=[...new Set(seedUrls().concat(announced().map(h=>h.url)))].slice(0,3);const since=nowS()-86400;
  const one=url=>new Promise(res=>{let ws,done=false;const seen=new Map();const end=v=>{if(done)return;done=true;try{ws.close()}catch(e){}res(v)};
    try{ws=new WebSocket(url)}catch(e){return res(null)}setTimeout(()=>end(null),6000);
    ws.onopen=()=>ws.send(JSON.stringify(["REQ","gate",{kinds:[KIND],"#c":["reg"],since}]));ws.onerror=()=>end(null);
    ws.onmessage=m=>{let a;try{a=JSON.parse(m.data)}catch(e){return}
      if(a[0]==="EVENT"&&a[1]==="gate"){const e=a[2];if(!e||!isRegistrar(e.pubkey)||!N.verifyEvent(e))return;let c;try{c=JSON.parse(e.content)}catch(x){return}
        if(c.ok&&(c.at||e.created_at*1000)>since*1000)seen.set(tagOf(e,"d"),1)}
      else if(a[0]==="EOSE"&&a[1]==="gate")end(seen.size)}});
  return (async()=>{for(const u of urls){const n=await one(u);if(n!==null)return n}return null})()}
async function newGate(done,btn){if(btn){btn.disabled=true;btn.textContent="Checking…"}
  const n=await approvalsToday();if(n===null||n<BETA_DAILY)return createKey(done);
  const el=screen(brand+'<h1>No spots left today</h1><p class="lede">While we test the app, we let in up to '+BETA_DAILY+' new members a day, and today&#39;s spots are taken. Please try again tomorrow.</p><p class="lede">We&#39;re sorry for the trouble. This is a beta test.</p>'+
    '<div class="stack"><button class="btn pri block" data-cpa="again">Try again</button><button class="btn block" data-cpa="back">Back</button></div>');
  el.onclick=e=>{const a=e.target.closest("[data-cpa]");if(!a)return;if(a.dataset.cpa==="again")newGate(done,a);else welcome(done)}}
function wordsGrid(w){return'<ol class="cp-words">'+w.split(" ").map(x=>'<li>'+esc(x)+'</li>').join("")+'</ol>'}
// "Copy the words": for a password manager, or to paste into a document and print
async function copyWords(w,btn){let ok=false;
  try{await navigator.clipboard.writeText(w);ok=true}catch(e){
    try{const t=document.createElement("textarea");t.value=w;t.setAttribute("readonly","");t.style.position="fixed";t.style.opacity="0";document.body.appendChild(t);t.select();ok=document.execCommand("copy");t.remove()}catch(e2){}}
  if(btn){const was=btn.dataset.was||(btn.dataset.was=btn.textContent);btn.textContent=ok?"Copied":"Couldn't copy. Write them down instead.";setTimeout(()=>{btn.textContent=was},2500)}}
const copyBtn='<button class="btn block" data-cpa="copy">Copy the words</button>';
function createKey(done){
  const w=N.generateSeedWords();
  const el=screen(brand+'<h1>Your 12 words</h1><p class="lede">Save these, in order: write them on paper, or copy them into a password manager or a document you print. They&#39;re the only way back in if you lose this phone. Nobody can reset them for you.</p>'+wordsGrid(w)+copyBtn+
    '<label class="cp-check"><input type="checkbox" id="cp-wrote"> I saved my 12 words</label><button class="btn pri block" data-cpa="next" disabled>Save my key</button><button class="tlink small" data-cpa="back">Back</button>');
  el.querySelector("#cp-wrote").onchange=e=>{el.querySelector('[data-cpa=next]').disabled=!e.target.checked};
  el.onclick=async e=>{const a=e.target.closest("[data-cpa]");if(!a)return;const act=a.dataset.cpa;if(act==="back")return welcome(done);if(act==="copy")return copyWords(w,a);
    if(act==="next"){a.disabled=true;await saveWords(w);done()}};
}
function restoreKey(done){
  const canScan="BarcodeDetector"in window&&navigator.mediaDevices;
  const el=screen(brand+'<h1>Use your key</h1><p class="lede">Type your 12 words, with spaces between them.</p>'+
    '<textarea class="inp cp-ta" id="cp-w" rows="3" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="word word word …"></textarea>'+
    '<div class="cp-sugs" id="cp-sug" aria-label="Suggestions"></div><p class="small muted cp-st" id="cp-st" role="status">0 of 12 words</p>'+
    '<p class="cp-err small" id="cp-e"></p><button class="btn pri block" data-cpa="ok">Continue</button>'+(canScan?'<button class="btn block" data-cpa="scan">Scan from my other phone</button><video id="cp-v" class="cp-video" playsinline hidden></video>':'')+
    '<button class="tlink small" data-cpa="back">Back</button>');
  // The words come from a fixed list of 2,048, and no two share their first 4 letters: suggest as you type; Tab or
  // Enter (or a tap on a suggestion) fills the word in. Words not on the list, and 12 that don't match, show at once.
  const ta=el.querySelector("#cp-w"),sug=el.querySelector("#cp-sug"),stl=el.querySelector("#cp-st");const WL=N.wordlist,WS=new Set(WL);
  const parts=()=>{const v=ta.value.toLowerCase();const ws=v.trim().split(/\s+/).filter(Boolean);const ends=/\s$/.test(v)||!ws.length;return{ws,cur:ends?"":ws[ws.length-1],done:ends?ws:ws.slice(0,-1)}};
  const upd=()=>{const p=parts();const bad=p.done.filter(w=>!WS.has(w));const m=p.cur?WL.filter(w=>w.startsWith(p.cur)).slice(0,4):[];
    sug.innerHTML=m.map(w=>'<button type="button" class="cp-sg" data-w="'+w+'">'+w+'</button>').join("");
    const n=p.ws.length;let msg=n+' of 12 words',cls='';
    if(bad.length){msg='Not on the list: '+bad.map(esc).join(", ");cls='bad'}else if(p.cur&&!m.length){msg='No word starts with “'+esc(p.cur)+'”';cls='bad'}
    else if(n===12&&WS.has(p.ws[11])){const ok=N.validateWords(p.ws.join(" "));msg=ok?'✓ All 12 words check out':'These 12 words don\'t match. Check the spelling and the order.';cls=ok?'ok':'bad'}
    else if(n>12){msg='That\'s more than 12 words.';cls='bad'}
    stl.innerHTML=msg;stl.className='small cp-st '+(cls||'muted')};
  const fill=w=>{const p=parts();ta.value=p.done.concat([w]).join(" ")+(p.done.length+1<12?" ":"");ta.focus();upd()};
  ta.addEventListener("input",upd);
  ta.addEventListener("keydown",e=>{if(e.key!=="Tab"&&e.key!=="Enter")return;const p=parts();
    if(p.cur){const m=WS.has(p.cur)?p.cur:WL.find(w=>w.startsWith(p.cur));if(m&&(e.key==="Tab"||p.ws.length<12||!WS.has(p.cur))){e.preventDefault();fill(m);return}}
    if(e.key==="Enter"){e.preventDefault();if(p.ws.length===12)el.querySelector("[data-cpa=ok]").click()}});
  sug.addEventListener("click",e=>{const b=e.target.closest(".cp-sg");if(b){e.preventDefault();fill(b.dataset.w)}});
  el.onclick=async e=>{const a=e.target.closest("[data-cpa]");if(!a)return;const act=a.dataset.cpa;if(act==="back")return welcome(done);
    if(act==="scan")return scan(el,w=>{el.querySelector("#cp-w").value=w;upd()});
    const w=el.querySelector("#cp-w").value.trim().toLowerCase().split(/\s+/).join(" ");
    if(!N.validateWords(w)){el.querySelector("#cp-e").textContent="Those words don't check out. Check the spelling and the order.";return}
    await saveWords(w);done()};
}
async function scan(el,got){const v=el.querySelector("#cp-v");try{const st=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});v.hidden=false;v.srcObject=st;await v.play();
  const det=new BarcodeDetector({formats:["qr_code"]});const tick=async()=>{if(!v.isConnected){st.getTracks().forEach(t=>t.stop());return}const r=await det.detect(v).catch(()=>[]);const t=r[0]&&r[0].rawValue;
    if(t&&/^citizens-key:/.test(t)){st.getTracks().forEach(t=>t.stop());v.hidden=true;got(t.slice(13))}else requestAnimationFrame(tick)};tick()}catch(e){el.querySelector("#cp-e").textContent="Couldn't open the camera. Type the words instead."}}
function showWaiting(){
  if(!joinMode)return;const j=docVal("join/"+me)||pendingJoin;if(!j)return;
  const el=screen(brand+'<h1>Almost there</h1><p class="lede">You asked to join'+(j.town?' from <b>'+esc(j.town)+'</b>':'')+'. '+(party.registrars.length?'During the beta, new members are approved by themselves, usually within a minute.':'A registrar will check that you&#39;re a real person and approve your key.')+' This page updates by itself.</p>'+
    '<div class="card stack"><div class="kv"><span>Your member key</span><span class="code">'+esc(N.nip19.npubEncode(me).slice(0,20))+'…</span></div>'+
    '<p class="small muted" style="margin:0">If a registrar asks, show them this screen.</p></div>'+hostsHtml()+
    '<div class="stack"><button class="btn block" data-cpa="words">Show my 12 words</button><button class="tlink small" data-cpa="redo">Change my town</button></div>');
  el.onclick=e=>{const a=e.target.closest("[data-cpa]");if(!a)return;if(a.dataset.cpa==="words")showWords(showWaiting);else if(a.dataset.cpa==="redo"){closeScreen();pendingJoin=null;writeDocRaw("join/"+me,{_del:1}).then(()=>location.reload())}};
}
async function writeDocRaw(d,v){v=keepJoined(d,v);await publish(signEv(docTemplate(d,v)))}
function hostsHtml(){const st=hostStatus();if(!st.length)return"";return'<div class="card stack"><h2>Hosts</h2>'+st.map(h=>'<div class="kv"><span>'+esc(h.name)+'</span><span class="'+(h.online?'kvy':'kvn')+'">'+(h.online?'● Connected':'○ Offline')+'</span></div>').join("")+'</div>'}

// ---------- the account card on the Me page ----------
async function showWords(after){
  const w=await getWords();
  const el=screen(brand+'<h1>Your key</h1>'+(w?'<p class="lede">Your 12 words. Anyone who sees them can act as you, so keep them private.</p>'+wordsGrid(w)+copyBtn:'<p class="lede">This device doesn&#39;t keep your 12 words. Use the copy you wrote down.</p>')+
    '<button class="btn pri block" data-cpa="close">Done</button>');if(typeof after!=="function")el.dataset.back="1";
  el.onclick=e=>{const a=e.target.closest("[data-cpa]");if(!a)return;if(a.dataset.cpa==="copy")return copyWords(w,a);if(a.dataset.cpa==="close"){closeScreen();if(typeof after==="function")after()}};
}
async function linkDevice(){
  const w=await getWords();
  const el=screen(brand+'<h1>Add another device</h1>'+(w?'<p class="lede">On your other phone or computer, open citizensparty.ca/app, choose <b>I already have a key</b>, then scan this code. Or type your 12 words there.</p><div class="cp-qr">'+N.qrSvg("citizens-key:"+w)+'</div><p class="small muted">Only show this code to your own devices.</p>':
    '<p class="lede">On the other device, open citizensparty.ca/app, choose <b>I already have a key</b> and type your 12 words.</p>')+'<button class="btn pri block" data-cpa="close">Done</button>');el.dataset.back="1";
  el.onclick=e=>{if(e.target.closest("[data-cpa=close]"))closeScreen()};
}
function requests(){
  const out=[];const ap=approvals();
  for(const d of collPaths("join")){const pk=d.slice(5);if(ap[pk]||owners.has(pk))continue;const e=docEvent(d);const v=docVal(d);if(!v||!e)continue;
    const reg=docEvent("reg/"+pk);let declined=false;if(reg){try{declined=JSON.parse(reg.content).ok===false&&newer(reg,e)}catch(x){}}if(declined)continue;out.push({pk,v,at:e.created_at})}
  return out.sort((a,b)=>a.at-b.at)}
function approveScreen(){
  const rq=requests();
  const el=screen(brand+'<h1>Join requests</h1><p class="lede">Approve only people you&#39;ve checked are real and live where they say.</p>'+
    (rq.length?rq.map(r=>'<div class="card stack"><div class="kv"><span>Town</span><b>'+esc(r.v.town||"—")+'</b></div><div class="kv"><span>Grid</span><span>'+esc(r.v.cell||"—")+'</span></div><div class="kv"><span>Key</span><span class="code">'+esc(N.nip19.npubEncode(r.pk).slice(0,20))+'…</span></div>'+
      '<div class="row2"><button class="btn pri" data-cpa="ok" data-pk="'+r.pk+'">Approve</button><button class="btn" data-cpa="no" data-pk="'+r.pk+'">Decline</button></div></div>').join(""):'<p class="muted">No requests right now.</p>')+
    '<button class="btn block" data-cpa="close">Done</button>');el.dataset.back="1";
  el.onclick=async e=>{const a=e.target.closest("[data-cpa]");if(!a)return;if(a.dataset.cpa==="close")return closeScreen();const pk=a.dataset.pk;const j=docVal("join/"+pk)||{};
    a.disabled=true;try{await writeDocRaw("reg/"+pk,{ok:a.dataset.cpa==="ok",cell:j.cell||"",at:Date.now()})}catch(x){alert(x.message)}approveScreen()};
}
function hostsScreen(){
  const st=hostStatus(),dis=disagreements(),bench=benchedHosts(),net=announced().length;
  const el=screen(brand+'<h1>Hosts</h1><p class="lede">Members run these computers. Each keeps a full copy of the record. Your app uses '+WANT+' at a time'+(net?' of the '+net+' in the network':'')+', checks every signature itself and compares the copies.</p>'+
    (st.length?st.map(h=>'<div class="card stack"><div class="kv"><b>'+esc(h.name)+'</b><span class="'+(h.online?'kvy':'kvn')+'">'+(h.online?'● Connected':'○ Offline')+'</span></div><div class="kv"><span>Records received</span><span>'+h.has+'</span></div>'+(h.repaired?'<div class="kv"><span>Records it was missing, sent back</span><span>'+h.repaired+'</span></div>':'')+'</div>').join(""):'<p class="muted">No hosts are listed yet.</p>')+
    (dis.length?'<div class="card"><h2>Copies disagree</h2>'+dis.map(d=>'<p class="small">'+esc(d.name)+' is missing '+d.missing+' record'+(d.missing===1?'':'s')+' the others have. Your app is sending them back.</p>').join("")+'</div>':(st.filter(h=>h.online).length>1?'<p class="small kvy">✓ The hosts&#39; copies agree.</p>':''))+
    (bench.length?'<div class="card"><h2>Not using for now</h2>'+bench.map(b=>'<p class="small">'+esc(b.name)+': '+esc(b.why||"it kept failing")+'. Your app will try it again tomorrow.</p>').join("")+'</div>':'')+
    '<div class="card stack"><div class="kv"><span>Party website</span><span>'+esc(SITE.replace(/^https?:\/\//,""))+'</span></div>'+
    '<p class="small muted" style="margin:0">Where the app finds hosts and the party&#39;s settings. Change it only if the party tells you the address has moved. The settings still have to be signed by the party&#39;s key.</p>'+
    '<div class="row2"><button class="btn" data-cpa="site">Change</button>'+(SITE!==SITE_DEFAULT?'<button class="btn" data-cpa="site-reset">Back to '+esc(SITE_DEFAULT.replace(/^https?:\/\//,""))+'</button>':'')+'</div></div>'+
    '<button class="btn pri block" data-cpa="close">Done</button>');el.dataset.back="1";
  el.onclick=e=>{if(e.target.closest("[data-cpa=close]"))return closeScreen();
    if(e.target.closest("[data-cpa=site-reset]")){try{localStorage.removeItem("citizens-site")}catch(x){}return location.reload()}
    if(e.target.closest("[data-cpa=site]")){let u=(prompt("The party's new website address","https://")||"").trim();if(!u||u==="https://")return;if(!/^https?:\/\//.test(u))u="https://"+u;
      try{u=new URL(u).origin}catch(x){return alert("That isn't a web address.")}lsSet("citizens-site",u);location.reload()}};
}
function cardHtml(){
  if(!me)return"";const n=isRegistrar(me)?requests().length:0;const st=hostStatus();const on=st.filter(h=>h.online).length;
  const row=(act,t,sub)=>'<button type="button" class="li" data-cpa-open="'+act+'"><span class="tx"><span class="t">'+t+'</span><span class="s">'+sub+'</span></span><span class="chev">›</span></button>';
  return'<div class="card stack"><h2>Your key</h2><p class="small muted" style="margin:0">Your key is how the app knows it&#39;s you. It lives on this phone, and your 12 words can bring it back.</p>'+
    '<div class="list">'+row("words","Show my 12 words","Write them down. They&#39;re the only way back in if you lose this phone.")+
    row("link","Use on another phone","Shows a code your other phone or computer scans, so you can vote from both.")+
    row("hosts","Hosts · "+on+" of "+st.length+" connected","The computers that keep the party&#39;s record. See which ones your app uses.")+
    (isRegistrar(me)?row("approve","Join requests"+(n?' ('+n+')':''),"People asking to join, for a registrar to approve."):'')+'</div></div>';
}
document.addEventListener("click",e=>{const a=e.target.closest("[data-cpa-open]");if(!a)return;e.preventDefault();e.stopPropagation();({link:linkDevice,words:showWords,hosts:hostsScreen,approve:approveScreen})[a.dataset.cpaOpen]()},true);

// ---------- voting stamps: secret ballots ----------
// Each member votes with a separate voting key (one per quarter, made from the same 12 words), never with their
// member key. A registrar stamps the voting key "a real member of grid X" with a blind signature: the member's app
// hides the key in a sealed envelope, the registrar signs the envelope without seeing inside, and the app takes the
// signature out. The stamp is real, but nobody, not even the registrar, can tell whose voting key it is.
// Scheme: RSA blind signatures, full-domain hash (MGF1-SHA256). One RSA key per registrar per quarter; the grid
// is the public exponent (a prime worked out from the grid's name), so a stamp only works for its own grid.
// The same rules are checked by the hosts (host/stamps.go) and the tests (tools/stamps.py).
const ENC=new TextEncoder();
const sha=b=>N.sha256(b);
const big=h=>BigInt("0x"+(h||"0")),hexOf=n=>n.toString(16);
function modpow(b,e,m){let r=1n;b%=m;if(b<0n)b+=m;while(e>0n){if(e&1n)r=r*b%m;b=b*b%m;e>>=1n}return r}
function egcd(a,b){let [x0,x1,r0,r1]=[1n,0n,a,b];while(r1){const q=r0/r1;[r0,r1]=[r1,r0-q*r1];[x0,x1]=[x1,x0-q*x1]}return [r0,x0]}
function modinv(a,m){const [g,x]=egcd(((a%m)+m)%m,m);if(g!==1n)return null;return ((x%m)+m)%m}
function gcd(a,b){while(b){[a,b]=[b,a%b]}return a}
function mgf1(seed,len){const out=new Uint8Array(len);for(let off=0,c=0;off<len;off+=32,c++){const b=new Uint8Array(seed.length+4);b.set(seed);new DataView(b.buffer).setUint32(seed.length,c);out.set(sha(b).subarray(0,Math.min(32,len-off)),off)}return out}
const byteLen=n=>Math.ceil(n.toString(16).length/2);
const fdh=(msg,n)=>big(bytesToHex(mgf1(ENC.encode(msg),byteLen(n))))%n;
const stampMsg=(P,grid,vpk)=>"citizens-stamp/1|"+P+"|"+grid+"|"+vpk;
const MR_BASES=[2n,3n,5n,7n,11n,13n,17n,19n,23n,29n,31n,37n];
function mr(n,a){let d=n-1n,s=0;while(!(d&1n)){d>>=1n;s++}let x=modpow(a,d,n);if(x===1n||x===n-1n)return true;for(let i=1;i<s;i++){x=x*x%n;if(x===n-1n)return true}return false}
function primeSmall(n){if(n<2n)return false;for(const p of MR_BASES){if(n===p)return true;if(n%p===0n)return false}return MR_BASES.every(a=>mr(n,a))}
const EXP={};
function gridExp(grid){if(EXP[grid])return EXP[grid];const h=sha(ENC.encode("citizens-grid/1|"+grid));
  let x=(1n<<32n)+BigInt(((h[0]<<24)|(h[1]<<16)|(h[2]<<8)|h[3])>>>1);if(!(x&1n))x++;while(!primeSmall(x))x+=2n;return EXP[grid]=x}
// quarters: 2026Q4. A stamp works for votes opened in its quarter; the next quarter's comes in the last 14 days.
function periodOf(ms){const d=new Date(ms);return d.getUTCFullYear()+"Q"+(Math.floor(d.getUTCMonth()/3)+1)}
function periodStart(P){const y=+P.slice(0,4),q=+P.slice(5);return Date.UTC(y,(q-1)*3,1)}
function nextPeriod(P){const y=+P.slice(0,4),q=+P.slice(5);return q===4?(y+1)+"Q1":y+"Q"+(q+1)}
function wantedPeriods(){const P=periodOf(Date.now()),Nx=nextPeriod(P);return periodStart(Nx)-Date.now()<14*864e5?[P,Nx]:[P]}
const okP=P=>/^\d{4}Q[1-4]$/.test(P||"");
const verified=new Map();
function stampOk(e){if(verified.has(e.id))return verified.get(e.id);let s;try{s=JSON.parse(e.content)}catch(x){return false}
  const kv=okP(s.period)&&docVal("stampkeys/"+s.reg+"_"+s.period);if(!kv||!kv.n)return false; // the registrar's key hasn't arrived yet: ask again later
  let ok=false;try{const n=big(kv.n),sig=big(s.sig);ok=typeof s.grid==="string"&&!!s.grid&&sig>0n&&sig<n&&modpow(sig,gridExp(s.grid),n)===fdh(stampMsg(s.period,s.grid,e.pubkey),n)}catch(x){}
  verified.set(e.id,ok);return ok}
const hasStamp=pk=>!!docEvent("stamps/"+pk);
// ----- the voting key for a quarter: made from your member key, so your 12 words bring it back -----
const vskOf=P=>sha(ENC.encode("citizens-vote/1|"+P+"|"+bytesToHex(sk)));
const vpkOf=P=>sk?N.getPublicKey(vskOf(P)):null;
const blindR=(P,n)=>{let r=big(bytesToHex(mgf1(ENC.encode("citizens-blind/1|"+P+"|"+bytesToHex(sk)),byteLen(n))))%n;while(gcd(r,n)!==1n)r++;return r};
const stampKey=P=>"citizens-stamp-"+me+"-"+P;
function myStamp(P){try{const s=JSON.parse(lsGet(stampKey(P))||"null");return s&&s.vpk===vpkOf(P)?s:null}catch(e){return null}}
// ----- a registrar's stamping key for a quarter, also made from its key (2 x 1024-bit primes; a few seconds, once) -----
const SMALLP=(()=>{const out=[];for(let i=3;out.length<300;i+=2){if(out.every(p=>i%p))out.push(i)}return out.map(BigInt)})();
function drbg(seed){let c=0;return n=>{const out=new Uint8Array(n);for(let o=0;o<n;o+=32){const b=new Uint8Array(seed.length+4);b.set(seed);new DataView(b.buffer).setUint32(seed.length,c++);out.set(sha(b).subarray(0,Math.min(32,n-o)),o)}return out}}
async function genPrime(rnd,bits){for(let i=0;;i++){if(i%8===7)await new Promise(r=>setTimeout(r,0));
  const b=rnd(bits/8);b[0]|=0xc0;b[b.length-1]|=1;const p=big(bytesToHex(b));if(SMALLP.some(q=>p%q===0n))continue;
  let ok=true;for(let k=0;k<24&&ok;k++){const a=2n+big(bytesToHex(rnd(bits/8)))%(p-3n);ok=mr(p,a)}if(ok)return p}}
const SKEYS={};
function stampSecret(P){if(SKEYS[P])return SKEYS[P];return SKEYS[P]=(async()=>{let c=null;try{c=JSON.parse(lsGet("citizens-skey-"+me+"-"+P)||"null")}catch(e){}
  if(c&&c.p&&c.q)return{p:big(c.p),q:big(c.q),n:big(c.p)*big(c.q)};
  const rnd=drbg(sha(ENC.encode("citizens-stampkey/1|"+P+"|"+bytesToHex(sk))));const p=await genPrime(rnd,1024);let q;do{q=await genPrime(rnd,1024)}while(q===p);
  lsSet("citizens-skey-"+me+"-"+P,JSON.stringify({p:hexOf(p),q:hexOf(q)}));return{p,q,n:p*q}})()}
function blindSign(K,grid,m){const e=gridExp(grid);const p1=K.p-1n,q1=K.q-1n;if(gcd(e,p1*q1)!==1n)return null;const lam=p1*q1/gcd(p1,q1);const d=modinv(e,lam);
  const m1=modpow(m,d%p1,K.p),m2=modpow(m,d%q1,K.q);const h=(modinv(K.q,K.p)*((m1-m2)%K.p+K.p))%K.p;return m2+h*K.q}
// ----- the loop: get my stamps; and, for a registrar, publish its stamping keys and stamp members' envelopes -----
let stampBusy=false,stampAgain=false;const stamped=new Set();
// Voting keys aren't tied to a grid (the user's call, Oct 28: people move, and a move shouldn't cost them their vote).
// New stamps say "a real member" (grid "BC"); each ballot carries the voter's grid at the time (g), which apps check.
// Stamps made before Oct 28 name a grid; they still work, and that grid stands in for a ballot without g.
const STAMP_GRID="BC";
async function stampTick(){if(!sk||joinMode||!isMember(me))return;if(stampBusy){stampAgain=true;return}stampBusy=true;
  try{
    for(const P of wantedPeriods()){
      if(isRegistrar(me)&&!docEvent("stampkeys/"+me+"_"+P)){const K=await stampSecret(P);await writeDocRaw("stampkeys/"+me+"_"+P,{n:hexOf(K.n),period:P})}
      if(myStamp(P))continue;const mem=docVal("members/"+me);if(!mem||!mem.cell)continue;
      const req=docVal("stampreq/"+me+"_"+P),ok=docEvent("stampok/"+me+"_"+P);
      if(req&&ok){const kv=docVal("stampkeys/"+req.reg+"_"+P);if(!kv)continue;const n=big(kv.n);let sig;try{sig=big(JSON.parse(ok.content).sig)}catch(x){continue}
        const s=sig*modinv(blindR(P,n),n)%n;const vpk=vpkOf(P);
        if(modpow(s,gridExp(req.grid),n)===fdh(stampMsg(P,req.grid,vpk),n)){lsSet(stampKey(P),JSON.stringify({period:P,grid:req.grid,reg:req.reg,sig:hexOf(s),vpk}));setTimeout(flushBallots,0);notify()}
        continue}
      if(req)continue; // waiting for a registrar
      const regs=[...party.registrars,...owners].filter(r=>docVal("stampkeys/"+r+"_"+P)); /* the hosts' registrars first: they're always on */if(!regs.length)continue;
      const reg=regs[0],n=big(docVal("stampkeys/"+reg+"_"+P).n),e=gridExp(STAMP_GRID);
      const b=fdh(stampMsg(P,STAMP_GRID,vpkOf(P)),n)*modpow(blindR(P,n),e,n)%n;
      await writeDocRaw("stampreq/"+me+"_"+P,{reg,grid:STAMP_GRID,b:hexOf(b),at:Date.now()})}
    if(isRegistrar(me)){const ap=approvals();
      for(const d of collPaths("stampreq")){const rest=d.slice(9),i=rest.indexOf("_"),pk=rest.slice(0,i),P=rest.slice(i+1);
        if(stamped.has(d)||!wantedPeriods().includes(P)||docEvent("stampok/"+pk+"_"+P))continue;const r=docVal(d);if(!r||r.reg!==me)continue;
        const m=docVal("members/"+pk);if(!(ap[pk]||owners.has(pk))||!m)continue; // one stamp per member per quarter
        const K=await stampSecret(P);const bl=big(r.b);if(bl<=0n||bl>=K.n)continue;const sig=blindSign(K,r.grid,bl);if(!sig)continue;
        stamped.add(d);await writeDocRaw("stampok/"+pk+"_"+P,{sig:hexOf(sig)})}}
  }catch(e){console.warn("stamps",e)}
  stampBusy=false;if(stampAgain){stampAgain=false;setTimeout(stampTick,200)}}
// ----- ballots: signed with the voting key; the first one counts, and there's no changing it -----
const ballotsKey=()=>"citizens-ballots-"+me;
let pendingBallots=[];
function loadPending(){try{pendingBallots=JSON.parse(lsGet(ballotsKey())||"[]")}catch(e){pendingBallots=[]}}
const savePending=()=>lsSet(ballotsKey(),JSON.stringify(pendingBallots));
// ----- Tor: in the installed Android app, ballots and stamps go through Tor (native/android TorPlugin.java) -----
// Tor starts quietly when the app opens. A ballot goes to each host's Tor address, or to its usual address through
// Tor when it has none, so no host (and not Cloudflare) learns who sent it. Everything else uses the normal connections.
const TOR=(()=>{const P=window.Capacitor&&window.Capacitor.Plugins;return P&&P.CitizensTor||null})();
const NATIVE=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
let torBrowser=/\.onion$/.test(location.hostname);
function torCheck(){if(TOR||torBrowser||!/^https?:$/.test(location.protocol))return;
  fetch("/api/tor",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(j=>{if(j&&j.tor)torBrowser=true}).catch(()=>{})} // the site knows Tor's exits
async function torState(){if(!TOR)return"none";try{const r=await TOR.status();return r&&r.state||"off"}catch(e){return"error"}}
// waits up to ms for Tor; an error isn't the end: Tor is restarted (at most every 8 s) and the wait goes on
let torKick=0;
async function torReady(ms){if(!TOR)return false;const t0=Date.now();
  for(;;){let st=await torState();if(st==="off"||(st==="error"&&Date.now()-torKick>8000)){torKick=Date.now();try{await TOR.start()}catch(e){}st="starting"}
    if(st==="on")return true;if(Date.now()-t0>=ms)return false;await new Promise(r=>setTimeout(r,500))}}
function onionOf(url){const h=announced().find(x=>x.url===url);return h&&h.onion||""}
function sendTor(url,ev){return TOR.send({url:onionOf(url)||url,msg:JSON.stringify(["EVENT",ev]),id:ev.id,timeout:60000})
  .then(r=>[!!(r&&r.ok),(r&&r.message)||""],()=>[false,"unreachable"])}
// Ballots and stamps never travel over the app's usual connections, which sign in with the member key: each goes
// over a fresh connection to each host that never signs in, so a host can't tie the ballot to the member that way.
function sendAnon(url,ev){return new Promise(res=>{let ws,done=false;const end=(ok,msg)=>{if(done)return;done=true;try{ws.close()}catch(e){}res([ok,msg||""])};
  try{ws=new WebSocket(url)}catch(e){return res([false,"bad address"])}
  ws.onopen=()=>ws.send(JSON.stringify(["EVENT",ev]));
  ws.onmessage=m=>{let a;try{a=JSON.parse(m.data)}catch(e){return}if(a[0]==="OK"&&a[1]===ev.id)end(!!a[2],a[3])};
  ws.onerror=()=>end(false,"unreachable");ws.onclose=()=>end(false,"closed");setTimeout(()=>end(false,"timeout"),10000)})}
// done as soon as the first host has it; the others still get it (and hosts copy from each other anyway)
async function publishAnon(ev,tor){const urls=[...relays.values()].filter(r=>r.ok).map(r=>r.url);if(!urls.length)throw new Error("offline");
  return new Promise((res,rej)=>{const out=[];let done=false;
    for(const u of urls)(tor?sendTor(u,ev):sendAnon(u,ev)).then(([ok,msg])=>{if(ok){let s=seenOn.get(u);if(!s)seenOn.set(u,s=new Set());s.add(ev.id)}out.push([ok,msg]);
      if(done)return;if(ok){done=true;ingest(ev,null);notify();return res()}
      if(out.length===urls.length){done=true;const why=(out.find(x=>/^(blocked|invalid)/.test(x[1]))||out[0])[1];rej(new Error(/^(blocked|invalid)/.test(why)?why.replace(/^\w+: /,""):"offline"))}})})}
let flushing=null;
// wait: how long to wait for Tor before leaving a ballot waiting (0 in the background; the app asks the member after a while)
function flushBallots(wait){if(flushing)return flushing.then(()=>wait?flushBallots(wait):undefined);if(!sk)return Promise.resolve();
  return flushing=doFlush(wait||0).finally(()=>{flushing=null})}
async function doFlush(wait){let torOk=null;
  try{for(const b of pendingBallots.slice()){const s=myStamp(b.P);if(!s)continue;const vsk=vskOf(b.P),vpk=vpkOf(b.P);
    const sign=(d,v)=>{const t=docTemplate(d,v);return N.finalizeEvent(t,vsk)};
    const tor=!!TOR&&!b.plain;if(tor){if(torOk===null)torOk=await torReady(wait);b.torWait=!torOk;if(!torOk)continue}
    try{if(!hasStamp(vpk))await publishAnon(sign("stamps/"+vpk,{period:s.period,grid:s.grid,reg:s.reg,sig:s.sig}),tor);
      await publishAnon(sign("ballots/"+vpk+"_"+b.i,b.g?{v:b.v,t:b.t,g:b.g}:{v:b.v,t:b.t}),tor)}
    catch(e){if(e.message==="offline")continue;console.warn("ballot",e)} // offline: it stays waiting and goes out later
    pendingBallots=pendingBallots.filter(x=>x!==b);savePending()}}
  catch(e){console.warn("ballots",e)}}
function castResult(i,P){const b=pendingBallots.find(x=>x.i===i);if(!b)return{sent:true};return{sent:false,stamp:!!myStamp(P),torFailed:!!b.torWait&&!!myStamp(P)}}
const voter={
  periodOf,
  key:P=>vpkOf(P),
  hasStamp:P=>!!myStamp(P),
  pending:()=>pendingBallots.map(b=>({i:b.i,v:b.v,P:b.P})),
  // how a ballot travels: "tor" (the installed Android app), "torbrowser" (the web app in Tor Browser), "plain"
  route:()=>TOR?"tor":torBrowser?"torbrowser":"plain",
  native:NATIVE,
  // sent: it reached a host. torFailed: Tor didn't open within `wait` ms; it stays waiting (sendPlain sends it anyway)
  async cast(i,v,P,wait){if(!sk)throw new Error("No key on this device.");if(pendingBallots.some(b=>b.i===i)||docEvent("ballots/"+vpkOf(P)+"_"+i))throw new Error("You've already voted on this.");
    pendingBallots.push({i,v,P,t:Date.now(),g:(docVal("members/"+me)||{}).cell||""});savePending();notify();setTimeout(stampTick,0);await flushBallots(wait||45000);return castResult(i,P)},
  async sendPlain(i){const b=pendingBallots.find(x=>x.i===i);if(!b)return{sent:true};b.plain=true;savePending();await flushBallots();return castResult(i,b.P)},
  // the "I voted" note goes out a while after the ballot, so the two can't be matched up by time
  turnoutDelay:()=>{const o=+lsGet("citizens-turnout-delay-ms");return o>=0&&lsGet("citizens-turnout-delay-ms")!=null?o:(2+Math.random()*18)*60e3}
};

// ---------- start ----------
let started=null;
function start(){if(started)return started;started=(async()=>{
  await partyReady;
  await COPY.load();
  takeDir(await dirReady);
  if(qs.has("demo")||(!seedUrls().length&&!announced().length))return LOCAL; // no hosts yet: run the local demo
  if(!await loadKey())await new Promise(res=>welcome(res));
  closeScreen();
  connectAll();
  // hosts on free tunnels get a new address when they restart: look again when the app comes back, goes online, or has no host
  const again=()=>{refreshDir();fillHosts()};document.addEventListener("visibilitychange",()=>{if(!document.hidden)again()});window.addEventListener("online",again);
  setInterval(()=>{if(![...relays.values()].some(r=>r.ok))again()},15000);setInterval(refreshDir,10*60000);
  subscribe({kinds:[KIND],"#c":["party","reg","hosts"]});
  subscribe({kinds:[KIND],"#c":["join"],authors:[me]});
  if(isRegistrar(me))subscribe({kinds:[KIND],"#c":["join"]});
  await new Promise(res=>{const t0=Date.now();const chk=()=>{const on=[...relays.values()].filter(r=>r.ok);const s=[...subs.values()];if((on.length&&on.every(r=>s.every(x=>x.eose.has(r.url))))||Date.now()-t0>5000)return res();setTimeout(chk,100)};chk()});
  if(isMember(me))lsSet("citizens-member-"+me,"1");
  if(isMember(me)&&!owners.has(me)){await collSynced("members");const j=docVal("join/"+me),m=docVal("members/"+me);if(j&&!m)writeDocRaw("members/"+me,Object.assign({},j,{joinedAt:Date.now()})).catch(()=>{});
    else if(m&&firstJoined(m.cell)&&m.joinedAt>firstJoined(m.cell)&&!(m.res||[]).length)writeDocRaw("members/"+me,m).catch(()=>{})}
  mineCache=null;if(lsGet("citizens-keep-copy")!=="own"){lsSet("citizens-keep-copy","own");COPY.reset()} // phones that kept more before Oct 28
  joinMode=!isMember(me)&&!lsGet("citizens-member-"+me);
  if(joinMode){
    if(docVal("join/"+me))setTimeout(showWaiting,0);
    listeners.push(()=>{if(joinMode&&isMember(me)){joinMode=false;const j=docVal("join/"+me);(j?writeDocRaw("members/"+me,Object.assign({},j,{joinedAt:Date.now()})):Promise.resolve()).finally(()=>location.reload())}});
  }
  // voting stamps: members fetch theirs; a registrar's app also stamps members' envelopes
  for(const c of ["stampkeys","stampreq","stampok","stamps"])want(c);
  // the app waits for this before deciding a key has no member record (so it never asks for an address while still loading)
  want("members");collSynced("members").then(()=>{membersSynced=true;notify()});setTimeout(()=>{membersSynced=true;notify()},12000);
  try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
  if(TOR)TOR.start().catch(()=>{});else torCheck(); // Tor gets ready in the background, long before the first vote
  loadPending();let stT=null;listeners.push(()=>{if(stT)return;stT=setTimeout(()=>{stT=null;stampTick();flushBallots()},800)});setInterval(stampTick,60000);setTimeout(stampTick,500);
  window.CPAccount={closeBackable,cardHtml,me:()=>me,hosts:hostStatus,approve:approveScreen,synced:()=>membersSynced,
    unsent:d=>outbox.some(e=>tagOf(e,"d")===d), // a record of yours no host has confirmed yet
    online:()=>[...relays.values()].filter(r=>r.ok).length,wasMember:()=>!!lsGet("citizens-hasrec-"+me)};
  // remembered once this key has a member record, so a reload that can't reach the hosts never asks for an address
  const markRec=()=>{if(!lsGet("citizens-hasrec-"+me)&&docVal("members/"+me))lsSet("citizens-hasrec-"+me,"1")};listeners.push(markRec);markRec();
  return{db,user,downloads,voter};
})();return started}
window.claude={__nostr:true,use:async n=>{const r=await start();if(r===LOCAL)return LOCAL?LOCAL.use(n):null;return r?r[n]||null:null}};
window.CPNostrAdapter={start,hostStatus,disagreements,party:()=>party};
})();
