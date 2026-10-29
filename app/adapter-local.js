// Local adapter: provides the window.claude API the app calls, backed by IndexedDB on this device.
// One device, owner mode. Used for local dev and the public demo until shared hosts exist (Stage 4).
// If a runtime is already present (claude.ai artifact, tests/mock.js), this file does nothing.
(function(){
if(window.claude&&window.claude.use)return;
const DB_NAME="citizens-local",STORE="docs";
const clone=o=>o==null?o:JSON.parse(JSON.stringify(o));
const store={};const leases={};
let idb=null;
const chan=typeof BroadcastChannel==="function"?new BroadcastChannel(DB_NAME):null;

function openIdb(){return new Promise(res=>{try{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>res(r.result);r.onerror=()=>res(null)}catch(e){res(null)}})}
function loadAll(){return new Promise(res=>{if(!idb)return res();try{const tx=idb.transaction(STORE,"readonly"),os=tx.objectStore(STORE),r=os.openCursor();r.onsuccess=()=>{const c=r.result;if(c){store[c.key]=c.value;c.continue()}else res()};r.onerror=()=>res()}catch(e){res()}})}
function persist(path){if(!idb)return;try{const tx=idb.transaction(STORE,"readwrite"),os=tx.objectStore(STORE);if(path in store)os.put(store[path],path);else os.delete(path);tx.oncomplete=()=>chan&&chan.postMessage({path,doc:store[path]===undefined?null:store[path]})}catch(e){}}
const ready=openIdb().then(d=>{idb=d;return loadAll()});

// ---- listeners ----
const cl=[],dl=[];let pending=false;
function collDocs(p){const pre=p+"/";return Object.keys(store).filter(k=>k.startsWith(pre)&&!k.slice(pre.length).includes("/")).map(k=>{const v=clone(store[k]);return{id:k.slice(pre.length),data:()=>clone(v)}})}
function docSnap(p){const v=clone(store[p]);return{exists:v!==undefined,data:()=>clone(v)}}
function notify(){if(pending)return;pending=true;setTimeout(()=>{pending=false;cl.forEach(l=>l.fn({docs:collDocs(l.p)}));dl.forEach(l=>l.fn(docSnap(l.p)))},5)}
function write(path,val){if(val===undefined)delete store[path];else store[path]=clone(val);persist(path);notify()}
if(chan)chan.onmessage=e=>{const{path,doc}=e.data||{};if(!path)return;if(doc===null)delete store[path];else store[path]=doc;notify()};
const off=(arr,l)=>()=>{const i=arr.indexOf(l);if(i>=0)arr.splice(i,1)};

function query(p,ob,dir,lim){return{
  orderBy(f,d){return query(p,f,d||"asc",lim)},
  limit(n){return query(p,ob,dir,n)},
  async get(){await ready;let d=collDocs(p);if(ob)d.sort((a,b)=>{const x=a.data()[ob],y=b.data()[ob];return(x<y?-1:x>y?1:0)*(dir==="desc"?-1:1)});if(lim)d=d.slice(0,lim);return{docs:d}}
}}
function merge(a,b){const c=Object.assign({},a);for(const k in b){const v=b[k];c[k]=(v&&typeof v==="object"&&!Array.isArray(v)&&c[k]&&typeof c[k]==="object"&&!Array.isArray(c[k]))?merge(c[k],v):v}return c}
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);

const db={
  collection(p){return Object.assign(query(p),{
    onSnapshot(fn){const l={p,fn};cl.push(l);ready.then(()=>fn({docs:collDocs(p)}));return off(cl,l)},
    async add(d){await ready;const id=newId();write(p+"/"+id,d);return{id}}
  })},
  doc(p){return{
    async get(){await ready;return docSnap(p)},
    async set(d){await ready;write(p,d)},
    async update(d){await ready;write(p,merge(store[p]||{},d))},
    async delete(){await ready;write(p,undefined)},
    onSnapshot(fn){const l={p,fn};dl.push(l);ready.then(()=>fn(docSnap(p)));return off(dl,l)},
    async acquire(o){const t=Date.now(),l=leases[p];if(l&&l.exp>t&&l.h!==o.holder)return{acquired:false};leases[p]={h:o.holder,exp:t+(o.ttlMs||30000)};return{acquired:true}}
  }}
};

// ---- user: one device-local id, owner of the local record ----
let uid=null;
try{uid=localStorage.getItem("citizens-local-uid")}catch(e){}
if(!uid){uid="u_"+newId();try{localStorage.setItem("citizens-local-uid",uid)}catch(e){}}
const user={
  id:async()=>uid,
  isOwner:async()=>true,
  can:async()=>true,
  profiles:async ids=>Object.fromEntries(ids.map(i=>[i,{name:i===uid?"You":""}]))
};

const downloads={async save(o){
  const data=typeof o.data==="string"?o.data:JSON.stringify(o.data,null,2);
  const url=URL.createObjectURL(new Blob([data],{type:o.mimeType||"application/json"}));
  const a=document.createElement("a");a.href=url;a.download=o.filename||"download.json";document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}};

window.claude={__local:true,use:async n=>n==="db"?db:n==="user"?user:n==="downloads"?downloads:null};
})();
