(function(){
const store={};const cl=[];const dl=[];let n=0;
function collDocs(p){const pre=p+"/";return Object.keys(store).filter(k=>k.startsWith(pre)&&!k.slice(pre.length).includes("/")).map(k=>({id:k.slice(pre.length),data:()=>JSON.parse(JSON.stringify(store[k]))}))}
function notify(){setTimeout(()=>{cl.forEach(l=>l.fn({docs:collDocs(l.p)}));dl.forEach(l=>l.fn({exists:!!store[l.p],data:()=>store[l.p]}))},5)}
function q(p,ob,dir,lim){return{orderBy(f,d){return q(p,f,d||"asc",lim)},limit(n){return q(p,ob,dir,n)},get(){let d=collDocs(p);if(ob)d.sort((a,b)=>(a.data()[ob]-b.data()[ob])*(dir==="desc"?-1:1));if(lim)d=d.slice(0,lim);return Promise.resolve({docs:d})}}}
const leases={};
const db={collection(p){return{...q(p),onSnapshot(fn){cl.push({p,fn});setTimeout(()=>fn({docs:collDocs(p)}),5);return()=>{}},add(d){const id="i"+(++n)+Math.random().toString(36).slice(2,6);store[p+"/"+id]=JSON.parse(JSON.stringify(d));notify();return Promise.resolve({id})}}},
 doc(p){return{set(d){store[p]=JSON.parse(JSON.stringify(d));notify();return Promise.resolve()},acquire(o){const t=Date.now();const l=leases[p];if(l&&l.exp>t&&l.h!==o.holder)return Promise.resolve({acquired:false});leases[p]={h:o.holder,exp:t+(o.ttlMs||30000)};return Promise.resolve({acquired:true})},update(d){const c=Object.assign({},store[p]);for(const k in d)c[k]=(d[k]&&typeof d[k]==="object"&&!Array.isArray(d[k])&&c[k]&&typeof c[k]==="object")?Object.assign({},c[k],d[k]):d[k];store[p]=c;notify();return Promise.resolve()},delete(){delete store[p];notify();return Promise.resolve()},onSnapshot(fn){dl.push({p,fn});setTimeout(()=>fn({exists:!!store[p],data:()=>store[p]}),5);return()=>{}}}}};
const user={id:async()=>"u_me",isOwner:async()=>true,can:async()=>true,profiles:async(ids)=>Object.fromEntries(ids.map(i=>[i,{name:i==="u_me"?"Sam":""}]))};
window.__store=store;window.__notify=notify;
window.__dl=[];const downloads={save:async(o)=>{window.__dl.push(o)}};
window.claude={use:async(n)=>n==="db"?db:n==="user"?user:n==="downloads"?downloads:null};
})();
