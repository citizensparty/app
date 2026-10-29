(function(){
"use strict";
// ---------- geography (BC outline + 100 km grid, precomputed) ----------
const G={W:__W__,H:__H__,S:100,ROWS:__ROWS__,COLS:__COLS__,ox:__OX__,oy:__OY__,K:__K__,path:"__PATH__",land:__LAND__};
const ROWL="ABCDEFGHIJKLMNOP";
function cellOf(lat,lon){const x=(lon+126.5)*G.K-G.ox,y=-(lat-54)*111.32-G.oy;const c=Math.min(G.COLS-1,Math.max(0,Math.floor(x/G.S))),r=Math.min(G.ROWS-1,Math.max(0,Math.floor(y/G.S)));return r+"-"+c}
function cellName(id){if(!id)return "—";const[r,c]=id.split("-").map(Number);return (r+1)+"ABCDEFGHIJKLMNOPQRST"[c]}
const LAND=new Set(G.land.map(a=>a[0]+"-"+a[1]));
const TOWNS=[["Vancouver",49.28,-123.12],["Surrey",49.19,-122.85],["Burnaby",49.25,-122.98],["Richmond",49.17,-123.14],["Abbotsford",49.05,-122.31],["Coquitlam",49.28,-122.79],["Langley",49.10,-122.66],["Delta",49.08,-123.06],["North Vancouver",49.32,-123.07],["West Vancouver",49.33,-123.16],["Maple Ridge",49.22,-122.60],["New Westminster",49.21,-122.91],["Mission",49.13,-122.31],["Chilliwack",49.16,-121.95],["Hope",49.38,-121.44],["Squamish",49.70,-123.16],["Whistler",50.12,-122.95],["Sechelt",49.47,-123.76],["Victoria",48.43,-123.37],["Saanich",48.48,-123.38],["Langford",48.45,-123.50],["Sooke",48.38,-123.73],["Duncan",48.78,-123.71],["Nanaimo",49.17,-123.94],["Parksville",49.32,-124.31],["Port Alberni",49.23,-124.81],["Courtenay",49.69,-124.99],["Campbell River",50.03,-125.24],["Port Hardy",50.72,-127.49],["Tofino",49.15,-125.91],["Powell River",49.84,-124.52],["Salt Spring Island",48.85,-123.50],["Kelowna",49.89,-119.50],["West Kelowna",49.86,-119.58],["Vernon",50.27,-119.27],["Penticton",49.49,-119.59],["Summerland",49.60,-119.67],["Osoyoos",49.03,-119.47],["Oliver",49.18,-119.55],["Princeton",49.46,-120.51],["Kamloops",50.67,-120.33],["Merritt",50.11,-120.79],["Salmon Arm",50.70,-119.27],["Sicamous",50.84,-118.98],["Revelstoke",51.00,-118.20],["Golden",51.30,-116.97],["Invermere",50.51,-116.03],["Cranbrook",49.51,-115.77],["Kimberley",49.67,-115.98],["Fernie",49.50,-115.06],["Creston",49.10,-116.51],["Nelson",49.49,-117.29],["Castlegar",49.32,-117.66],["Trail",49.10,-117.71],["Rossland",49.08,-117.80],["Grand Forks",49.03,-118.44],["Nakusp",50.24,-117.80],["Lillooet",50.69,-121.94],["Clearwater",51.65,-120.04],["100 Mile House",51.64,-121.29],["Williams Lake",52.14,-122.14],["Quesnel",52.98,-122.49],["Bella Coola",52.37,-126.75],["Valemount",52.83,-119.26],["McBride",53.30,-120.17],["Prince George",53.92,-122.75],["Vanderhoof",54.02,-124.00],["Fort St. James",54.44,-124.25],["Burns Lake",54.23,-125.76],["Houston",54.40,-126.67],["Mackenzie",55.34,-123.09],["Smithers",54.78,-127.17],["Hazelton",55.25,-127.67],["Terrace",54.52,-128.60],["Kitimat",54.05,-128.65],["Prince Rupert",54.32,-130.32],["Masset (Haida Gwaii)",54.01,-132.15],["Daajing Giids (Haida Gwaii)",53.25,-132.07],["Stewart",55.94,-129.99],["Chetwynd",55.70,-121.63],["Tumbler Ridge",55.13,-121.00],["Dawson Creek",55.76,-120.24],["Fort St. John",56.25,-120.85],["Hudson's Hope",56.03,-121.91],["Fort Nelson",58.81,-122.70],["Dease Lake",58.44,-130.00],["Atlin",59.58,-133.69]].sort((a,b)=>a[0].localeCompare(b[0]));
const TOWN_CELL={};TOWNS.forEach(t=>{const c=cellOf(t[1],t[2]);TOWN_CELL[t[0]]=c;LAND.add(c)});
const BIG=["Vancouver","Surrey","Burnaby","Richmond","Abbotsford","Coquitlam","Kelowna","Victoria","Saanich","Langley","Delta","Nanaimo","Kamloops","Chilliwack","Prince George","Vernon","Maple Ridge","Courtenay","Campbell River","Penticton","Mission","Langford","Port Alberni","Fort St. John","Cranbrook","Salmon Arm","Squamish","Duncan","Terrace","Dawson Creek","Prince Rupert","Williams Lake","Nelson","Powell River","Quesnel","Trail","Smithers","Kitimat","Merritt","Revelstoke","Fort Nelson"];
// BC's populated places [name, lat, lon, 1 municipality | 2 community | 3 neighborhood] (tools/make_places.py), for
// suggestions as people type (on the device: nothing typed is sent anywhere) and for naming grids with no big town
const PLACES=__PLACES__;
let PLC=null;function places(){if(PLC)return PLC;PLC=PLACES.map(p=>({name:p[0],low:p[0].toLowerCase(),cell:cellOf(p[1],p[2]),cat:p[3]})).filter(p=>LAND.has(p.cell));return PLC}
function placeOf(id){const t=TOWNS.filter(t=>TOWN_CELL[t[0]]===id).map(t=>t[0]);if(!t.length){const p=places().filter(x=>x.cell===id).sort((a,b)=>(a.cat===1?0:a.cat===3?1:2)-(b.cat===1?0:b.cat===3?1:2)||a.name.length-b.name.length)[0];return p?p.name:null}t.sort((a,b)=>{const ia=BIG.indexOf(a),ib=BIG.indexOf(b);return (ia<0?999:ia)-(ib<0?999:ib)});return t[0].replace(/ \(.*\)/,"")}
function gridName(id){if(!id)return "—";const p=placeOf(id);return p?p+" area":"Grid "+cellName(id)}
function gridFull(id){if(!id)return "—";const p=placeOf(id);return p?p+" area · "+cellName(id):"Grid "+cellName(id)}
function townsIn(cell){return TOWNS.filter(t=>TOWN_CELL[t[0]]===cell).map(t=>t[0])}

// ---------- constants ----------
const CAP={principle:10,policy:20,plan:20};
const KIND_PL={principle:"Principles",policy:"Policies",plan:"Plans"};
const KIND_ONE={principle:"principle",policy:"policy",plan:"plan"};
const LIM={principle:75,title:80,policy:600,plan:4000,team:40,purpose:200};
const FIRST=["Aiden","Amara","Ben","Chloe","Daniel","Divya","Emma","Ethan","Fatima","Gurpreet","Hannah","Harjit","Isabelle","Jack","Jasmine","Kai","Kevin","Leah","Liam","Lucas","Maya","Megan","Mohammed","Nathan","Nicole","Noah","Olivia","Owen","Priya","Rachel","Rohan","Ryan","Sarah","Simran","Sophie","Tyler","Wei","Zoe","Grace","Marcus","Tanya","Colin","Dana","Erin","Graham","Heather","Ian","Janelle","Kyle","Lindsay"];
const LAST=["Anderson","Bains","Campbell","Chen","Dhillon","Douglas","Fraser","Gill","Grewal","Harris","Johal","Kaur","Lam","Leblanc","MacDonald","Martin","McLeod","Morrison","Nguyen","Patel","Reid","Robertson","Sandhu","Singh","Smith","Stewart","Tremblay","Walker","Wong","Young","Bergstrom","Hamilton","Kowalski","Novak","Ross","Thompson","Wilson","Murray","Sidhu","Park"];
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}

// ---------- state ----------
const S={ready:false,db:null,user:null,me:null,canWrite:null,readOnly:false,isOwner:false,
  members:{},votes:{},ballots:{},stamps:{},items:{},rawItems:{},ends:{},meets:{},odocs:{},chain:{},cfg:{hours:72,minVoters:5,penalty:72,probation:0},names:{},
  ui:{tab:"plat",plat:null,car:{},view:null,stack:[],gridSel:null,pick:null}};
let C={};
const ASG={};
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let NOW=null;const now=()=>NOW==null?Date.now():NOW; // NOW: checking an outcome as of an earlier moment
// The owner's test tools (fake test members and their votes, sample votes, "end this vote now", vote-length settings,
// breaking the record on purpose) exist only in the one-device demo (no hosts), never on the real record (removed
// Oct 28, before launch). DEMO: the app has no voter, i.e. it isn't talking to the party's hosts.
const DEMO=()=>!S.voter;
// time left, in its largest unit, rounded: "3 days left", "6 hours left", "25 min left"
function left(ms){if(ms<=0)return "closed";const H=36e5;if(ms>=23.5*H){const d=Math.round(ms/(24*H));return d+(d===1?" day":" days")+" left"}if(ms>=H){const h=Math.round(ms/H);return h+(h===1?" hour":" hours")+" left"}return Math.max(1,Math.round(ms/6e4))+" min left"}
const plural=(n,one,many)=>Number(n).toLocaleString()+" "+(n===1?one:(many||one+"s"));
function fdate(t){try{return new Date(t).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}catch(e){return ""}}
function fdt(t){try{return new Date(t).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}catch(e){return ""}}
function fmtHours(h){if(h>=48&&h%24===0)return (h/24)+" days";if(h>=1){const r=Math.round(h*10)/10;return r+(r===1?" hour":" hours")}if(h<=0)return "no time";return Math.round(h*60)+" minutes"}
function myMember(){return S.me?S.members[S.me]:null}
function myCell(){const m=myMember();return m?m.cell:null}
function nameOf(id){if(!id)return "Someone";const m=S.members[id];if(m&&m.sim){const h=hash(id);return FIRST[h%FIRST.length]+" "+LAST[(h>>>8)%LAST.length]}const p=S.names[id];return (p&&p.name)||(id===S.me?"You":"A member")}
function avatarOf(id){const p=S.names[id];return p&&p.avatarUrl?p.avatarUrl:""}
function initials(id){const w=nameOf(id).trim().split(/\s+/).filter(Boolean);if(!w.length)return "?";return (w.length>1?w[0][0]+w[w.length-1][0]:w[0].slice(0,2)).toUpperCase()}
function avatar(id,size){const a=avatarOf(id);const st=size?' style="width:'+size+'px;height:'+size+'px;line-height:'+size+'px"':'';return a?'<img class="av"'+st+' alt="" src="'+esc(a)+'">':'<span class="av"'+st+'>'+esc(initials(id))+'</span>'}
function clean(d){const x=Object.assign({},d||{});delete x.id;return x}
function voterCode(uid){const h=hash(uid);return "V-"+(h.toString(36).toUpperCase().padStart(6,"0").slice(-6))}

let q=Promise.resolve();
function enqueue(fn){const p=q.then(fn);q=p.catch(()=>{});return p}
function toast(msg,kind){document.querySelectorAll(".toast").forEach(t=>t.remove());
  kind=kind||(/didn't save|failed|full|view-only|can't|couldn't/i.test(msg)?"err":/saved\. It goes out|already|ended|first\./i.test(msg)?"warn":"ok");
  const t=document.createElement("div");t.className="toast t-"+kind;t.setAttribute("role",kind==="err"?"alert":"status");
  t.innerHTML='<i aria-hidden="true">'+(kind==="err"?IC.x:kind==="warn"?IC.warn:IC.check)+'</i><span></span>';t.lastChild.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),4600)}
// one matched icon pair (same stroke and size) for Yes/No, toasts and notices
const IC={check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>',
  warn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v6M12 17h.01"/></svg>'};
async function guard(fn,okMsg){try{await fn();if(okMsg)toast(okMsg);return true}catch(e){const c=e&&e.code;if(c==="invalid_argument"&&S.canWrite!==true){S.readOnly=true;render();toast("You have view-only access to this page.")}else if(c==="quota_exceeded"){toast("Storage is full.","err")}else{toast("Couldn't save. Check your connection.","err")}return false}}

// ---------- item basics ----------
function isClosed(it){return now()>=it.closes}
function isElection(it){return it.kind==="office"&&it.act==="election"}
// a grid principle needs supporters (Yes votes from 5% of the grid, at least 5, but never more than the grid has) within
// its one 72-hour window to go to a full vote; it then needs a majority to pass
const Q_FROM=0,Q_PCT=0.05,Q_FLOOR=5,MIN_GRID=20;
// BETA: the new-member cool-down and the 20-member minimum per grid are waived. The app still says when they'd normally apply.
const BETA_WAIVE=true;const BETA_NOTE=", but for the beta phase, this is being waived.";
function qApplies(it){return it.kind==="principle"&&it.level!=="prov"&&(it.at||0)>=Q_FROM}
function qInfo(it){const k="q"+it.id;if(C[k])return C[k];let base=0,yes=0;
  for(const id in S.members){const m=S.members[id];if(m.cell!==it.cell||(m.joinedAt||0)>it.at)continue;base++}yes=ballotsOf(it).filter(b=>b.v==="y"&&b.cell===it.cell).length;
  const need=Math.min(Math.max(Q_FLOOR,Math.ceil(base*Q_PCT)),Math.max(1,base));return C[k]={need,yes,met:yes>=need}}
function qShow(it){return tally(it).voters>=Math.max(1,S.cfg.minVoters||5)}
function qProg(it){const q=qInfo(it);return qShow(it)?q.yes+'/'+q.need:'needs '+q.need}
function hasQ(it){return !qApplies(it)||qInfo(it).met}
function required(it){return it.level!=="prov"&&hasQ(it)}
function teamName(oid){const o=teams()[oid];if(o)return o.name;const m=S.items[oid];return m&&m.name?m.name:"a team"}
function teamLink(oid,label){return '<button type="button" class="tlink" data-act="open-team" data-v="'+oid+'">'+esc(label)+' <span aria-hidden="true">↗</span></button>'}
function titleHtml(it){
  if(it.kind==="office"){const oid=it.act==="create"?it.id:it.office;const tm=teams()[oid];const nm=tm?teamLink(oid,tm.name):esc(teamName(oid));
    if(it.act==="create")return 'New team: '+(tm?teamLink(oid,it.name):esc(it.name));
    if(it.act==="rename")return 'Rename '+nm+' to '+esc(it.name);
    if(it.act==="close")return 'Close the '+nm+' team';
    if(it.act==="recall")return 'Recall '+esc(nameOf(it.target))+' as '+nm+' lead';
    if(it.act==="election")return (it.round>1?'Runoff: ':'')+'Elect a lead for '+nm;}
  if(it.kind==="promote"){const src=S.items[it.src];return 'Take it BC-wide: '+(src?'<button type="button" class="tlink" data-act="open-item" data-v="'+src.id+'">'+esc(itemTitle(src))+' <span aria-hidden="true">↗</span></button>':'(missing)')}
  return esc(itemTitle(it));
}
function itemTitle(it){
  if(it.kind==="principle")return it.removes?"Remove: "+it.text:it.moves?"Move to #"+it.to+": "+it.text:it.text;
  if(it.kind==="promote"){const src=S.items[it.src];return "Take it BC-wide: "+(src?itemTitle(src):"(missing)")}
  if(it.kind==="office"){const tn=teamName(it.office);
    if(it.act==="create")return "New team: "+it.name;
    if(it.act==="rename")return "Rename "+tn+" to "+it.name;
    if(it.act==="close")return "Close the "+tn+" team";
    if(it.act==="recall")return "Recall "+nameOf(it.target)+" as "+tn+" lead";
    if(it.act==="election")return (it.round>1?"Runoff: ":"")+"Elect a lead for "+tn;}
  return it.title;
}
function kindLabel(it){if(it.kind==="promote")return "Send to BC";if(it.kind==="office")return {create:"New team",rename:"Rename team",close:"Close team",recall:"Recall a lead",election:"Lead election"}[it.act]||"Team vote";if(it.removes)return "Remove a "+KIND_ONE[it.kind];if(it.moves)return "Move a "+KIND_ONE[it.kind];if(it.replaces&&it.kind==="principle")return "Reword a principle";return (it.level==="prov"?"BC ":"New ")+KIND_ONE[it.kind]+(it.pos?" at #"+it.pos:"")}
function scopeLabel(it){return it.level==="prov"?"All of BC":gridName(it.cell)}
// ---------- secret ballots ----------
// A ballot is signed with the member's voting key for that quarter, never their member key, and carries a registrar's
// blind stamp ("a real member of grid X"), so nobody can tell whose it is (adapter-nostr.js, voting stamps).
// S.votes only says who took part ("I voted", for the penalty box); the choices are counted from the ballots.
function periodOf(ms){const d=new Date(ms);return d.getUTCFullYear()+"Q"+(Math.floor(d.getUTCMonth()/3)+1)}
// demo mode and tests run on one device, so they use a stand-in voting key
function myKey(it){const P=periodOf(it.at);return S.voter?S.voter.key(P):"d"+hash(S.me+"|"+P).toString(36)+"-"+P}
function BAL(){if(C.bal)return C.bal;const out={};
  for(const id in S.ballots){const j=id.indexOf("_");if(j<1)continue;const k=id.slice(0,j),i=id.slice(j+1),it=S.items[i],st=S.stamps[k],b=S.ballots[id];
    // a stamp works for votes opened in its quarter. The ballot's grid is the one the voter's app gave (g), or, for a ballot
    // from before Oct 28, its stamp's grid; except BC-wide, it must be the vote's grid
    if(!it||!st||!b||b.v==null||st.period!==periodOf(it.at))continue;const cell=b.g||(st.grid!=="BC"?st.grid||"":"");
    if(it.level!=="prov"&&cell!==it.cell)continue;(out[i]=out[i]||[]).push({k,cell,v:b.v,t:b.t||it.at})}
  return C.bal=out}
function ballotsOf(it){return BAL()[it.id]||[]}
const LOCALV={}; // votes this device just cast, until they come back from the hosts
function myVote(id){const it=S.items[id];if(!it)return undefined;const k=myKey(it);const b=ballotsOf(it).find(x=>x.k===k);if(b)return b.v;const p=S.voter&&S.voter.pending().find(x=>x.i===id);return p?p.v:LOCALV[id]}
function took(uid,id){const v=S.votes[uid];return !!(v&&v.b&&v.b[id]!=null)||(uid===S.me&&myVote(id)!=null)}

// ---------- standing engine: probation, penalty box, eligibility ----------
// members who joined before the shared cool-down rule keep their old (shorter) new-member wait
const COOL_FROM=0;
// only principles are live for now; policies, plans and teams are hidden and don't count
function liveItem(it){if(!it)return false;if(it.kind==="principle")return true;if(it.kind==="promote"){const s=S.items[it.src];return !!(s&&s.kind==="principle")}return false}
function engine(uid){
  const key="e"+uid;if(C[key])return C[key];const m=S.members[uid];if(!m)return null;
  const tk=id=>took(uid,id);const P=S.cfg.penalty*3600e3,PR=(m.joinedAt||0)>=COOL_FROM?P:(S.cfg.probation||0)*3600e3;
  const newTo=m.joinedAt+PR;const boxes=[{from:m.joinedAt,to:BETA_WAIVE?m.joinedAt:newTo,why:"new"}];const elig={};const missed=[],voted=[];
  const rel=Object.values(S.items).filter(it=>liveItem(it)&&(it.level==="prov"||it.cell===m.cell)).sort((a,c)=>a.at-c.at);const boxedOut=[],whyNot={};
  for(const it of rel.slice().sort((a,c)=>a.closes-c.closes||a.at-c.at)){
    const bx=boxes.find(x=>x.from<=it.at&&it.at<x.to);
    const ok=it.at>=m.joinedAt&&!bx;elig[it.id]=ok;if(bx)whyNot[it.id]=bx.why;
    if(!isClosed(it)||!required(it)||it.voided||it.at<m.joinedAt)continue;
    if(isElection(it)&&!electionCands(it).length&&!tk(it.id))continue;
    if(bx){if(bx.why==="missed"&&!tk(it.id))boxedOut.push(it);continue}
    if(tk(it.id)){voted.push(it);continue}
    // missed, but already in the penalty box for part of the vote: counts as missed, no new penalty
    const pen=boxes.find(x=>x.why==="missed"&&x.from<it.closes&&x.to>it.at);
    if(pen){boxedOut.push(it);continue}
    missed.push(it);boxes.push({from:it.closes,to:it.closes+P,why:"missed",item:it});
  }
  const t=now();let until=0,why=null,cause=null;
  // chained boxes: extend while contiguous
  const active=boxes.filter(x=>x.from<=t&&t<x.to&&x.to>x.from);
  if(active.length){until=Math.max(...active.map(x=>x.to));const a=active.sort((x,y)=>y.to-x.to)[0];why=a.why;cause=a.item||null}
  const pending=rel.filter(it=>elig[it.id]&&!isClosed(it)&&required(it)&&!tk(it.id)&&!(isElection(it)&&!electionCands(it).length)).sort((a,c)=>a.closes-c.closes);
  const provOpen=rel.filter(it=>elig[it.id]&&!isClosed(it)&&it.level==="prov"&&!tk(it.id));
  const cellClosed=rel.filter(it=>required(it)&&isClosed(it)&&elig[it.id]&&!it.voided&&!(isElection(it)&&!electionCands(it).length&&!tk(it.id)));
  const prov=rel.filter(it=>it.level==="prov"&&isClosed(it)&&elig[it.id]);
  return C[key]={m,elig,missed:missed.sort((a,c)=>c.closes-a.closes),boxedOut:boxedOut.sort((a,c)=>c.closes-a.closes),whyNot,voted,pending,provOpen,total:cellClosed.length+boxedOut.length,voteCount:voted.length,provTotal:prov.length,provVoted:prov.filter(it=>tk(it.id)).length,inBox:!!until,until,why,cause,waivedNew:BETA_WAIVE&&!until&&t<newTo?newTo:0};
}
function me(){return S.me?engine(S.me):null}
function canVoteOn(it){const e=me();return !!(e&&e.elig[it.id])}
function eligibleIds(it){return Object.keys(S.members).filter(id=>{const e=engine(id);return e&&e.elig[it.id]})}
function boxLabel(e){return e.why==="new"?"New member":"Penalty box"}

// ---------- tallies ----------
function passes(it,y,n){if(it.kind==="office"&&it.act==="close")return y>0&&y*3>=2*(y+n);return y>n}
function thresholdText(it){if(it.level==="prov")return "Passes if most qualified grids vote yes (a grid qualifies with "+S.cfg.minVoters+"+ voters).";if(isElection(it))return "The winner needs more than half of the ballots, with at least "+S.cfg.minVoters+" cast. If nobody gets there, the top two can go to a runoff.";if(it.kind==="office"&&it.act==="close")return "Needs a two-thirds majority of votes cast, with at least "+S.cfg.minVoters+" voting.";return "Needs a majority of votes cast, with at least "+S.cfg.minVoters+" voting."}
const MIN_GRIDS=5;// BC votes opened before this use the old rule (most reporting grids)
const BC_RULE_FROM=0;
function tally(it){
  if(C["t"+it.id])return C["t"+it.id];
  const ids=eligibleIds(it),priv=S.cfg.minVoters;let min=priv;
  if(isElection(it)){const cands=electionCands(it);const counts={};let total=0;
    for(const b of ballotsOf(it)){const v=b.v;total++;if(cands.includes(v))counts[v]=(counts[v]||0)+1}
    const rank=cands.slice().sort((a,b)=>(counts[b]||0)-(counts[a]||0));const top=rank[0];const rem=Math.max(0,ids.length-total);
    const winner=top&&total>=min&&(counts[top]||0)>total/2?top:null;
    const early=top&&(counts[top]||0)>(total+rem)/2&&total>=min?top:null;
    return C["t"+it.id]={election:true,counts,total,voters:total,eligible:ids.length,rank,winner,early,pass:!!winner,min,priv}}
  if(it.level!=="prov")min=Math.max(1,Math.min(priv,ids.length)); // a grid smaller than the minimum can still decide
  const byCell={};let y=0,n=0;
  for(const b of ballotsOf(it)){const v=b.v;if(v!=="y"&&v!=="n")continue;const c=b.cell;(byCell[c]=byCell[c]||{y:0,n:0})[v]++;v==="y"?y++:n++}
  const rem=Math.max(0,ids.length-y-n);let r;
  if(it.kind==="promote"){const E=ids.length;const pass=(y+n)>=min&&y>E/2;const sureNo=y+rem<=E/2;
    r={y,n,voters:y+n,eligible:E,rem,min,pass,early:pass?"pass":sureNo?"fail":null,needAll:true}}
  else if(it.level!=="prov"){const pass=(y+n)>=min&&passes(it,y,n);
    const sureYes=(y+n)>=min&&passes(it,y,n+rem);const sureNo=!passes(it,y+rem,n)||(y+n+rem)<min;
    r={y,n,voters:y+n,eligible:ids.length,rem,min,pass,early:sureYes?"pass":sureNo?"fail":null};
    if(qApplies(it)&&!qInfo(it).met){r.pass=false;if(r.early==="pass")r.early=null}}
  else{let qc=0,yc=0;const G=new Set(ids.map(id=>S.members[id].cell)).size;for(const c in byCell){const t=byCell[c];if(t.y+t.n>=min){qc++;if(t.y>t.n)yc++}}r={y,n,voters:y+n,eligible:ids.length,rem,min,byCell,q:qc,yc,G,minGrids:MIN_GRIDS,pass:(it.at||0)>=BC_RULE_FROM?qc>=MIN_GRIDS&&yc>G/2:qc>0&&yc>qc/2,early:null}}
  r.priv=priv;return C["t"+it.id]=r;
}
function outcome(it){
  if(isElection(it)){const tm=teams()[it.office];if(tm&&tm.closedAt&&tm.closedAt<=it.closes)return{key:"void",label:"Cancelled",cls:""};const t=tally(it);
    if(!isClosed(it))return t.early?{key:"open",label:nameOf(t.early)+" leading",cls:"yes",sub:"Has a majority already; wins when voting ends"}:{key:"open",label:"Voting open",cls:"warn"};
    return t.winner?{key:"won",label:"Won by "+nameOf(t.winner),cls:"yes"}:{key:"nowin",label:"No winner",cls:"no"}}
  const t=tally(it);
  if((CAP[it.kind]||it.kind==="promote")&&isVoid(it))return{key:"void",label:"Voided",cls:"no"};
  if(qApplies(it)&&!qInfo(it).met)return isClosed(it)?{key:"rejected",label:"Expired",cls:"no",sub:"Didn't get enough supporters in time"}:{key:"open",label:"Gathering support",cls:"warn"};
  if(it.kind==="promote"){const need=Math.max(0,Math.floor(t.eligible/2)+1-t.y);if(t.pass)return{key:"adopted",label:"Passed",early:!isClosed(it),cls:"yes"};if(isClosed(it)||t.early==="fail")return{key:"rejected",label:"Rejected",cls:"no"};return t.voters<t.min?{key:"open",label:"Open",cls:""}:{key:"open",label:need+" more Yes needed",cls:"warn"}}
  if(!isClosed(it)){if(t.early==="pass")return{key:"open",label:"Passed",early:true,cls:"yes",sub:"Took effect when more than half the grid voted Yes"};if(t.early==="fail")return{key:"open",label:"Defeated early",cls:"no",sub:"Can no longer pass"};return t.voters<t.min?{key:"open",label:"Open",cls:""}:{key:"open",label:t.pass?"Passing so far":"Not passing yet",cls:"warn"}}
  if(!t.pass)return{key:"rejected",label:"Rejected",cls:"no"};
  if(CAP[it.kind]){seated(it.kind,it.level,it.cell);if(EFF[it.id]==="void")return{key:"void",label:"Voided",cls:"no"};return{key:"adopted",label:"Passed",cls:"yes"}}
  return{key:"adopted",label:"Adopted",cls:"yes"};
}

// ---------- platform slots ----------
function scopeMatch(it,kind,level,cell){return it.kind===kind&&it.level===level&&(level==="prov"||it.cell===cell)}
const EFF={};
// an item counts once it has passed: at close, or the moment more than half of all eligible members voted Yes
function effective(it){if(it.voided)return false;const t=tally(it);return isClosed(it)?t.pass:t.early==="pass"}
function decidedAt(it){if(isClosed(it))return it.closes;const t=tally(it);if(t.early!=="pass")return Infinity;
  const ts=ballotsOf(it).filter(b=>b.v==="y").map(b=>b.t).sort((a,b)=>a-b);
  const k=Math.floor(t.eligible/2);return ts[Math.min(k,ts.length-1)]||it.at}
function seated(kind,level,cell){
  const key="s"+kind+level+cell;if(C[key])return C[key];
  const done=Object.values(S.items).filter(i=>scopeMatch(i,kind,level,cell)&&effective(i)).sort((a,b)=>decidedAt(a)-decidedAt(b)||a.at-b.at);
  const list=[];
  for(const it of done){
    if(it.removes){const i=list.findIndex(x=>x.id===it.removes);if(i>=0){list.splice(i,1);EFF[it.id]="removed"}else EFF[it.id]="void";continue}
    if(it.moves){const i=list.findIndex(x=>x.id===it.moves);if(i<0){EFF[it.id]="void";continue}const x=list.splice(i,1)[0];list.splice(Math.min(Math.max(0,(it.to||1)-1),list.length),0,x);EFF[it.id]="moved";continue}
    if(it.replaces){const i=list.findIndex(x=>x.id===it.replaces);if(i>=0){list[i]=it;EFF[it.id]="in";continue}}
    if(list.length>=CAP[kind]){EFF[it.id]="void";continue}
    const pos=it.pos?Math.min(Math.max(0,it.pos-1),list.length):it.slot?Math.min(it.slot-1,list.length):list.length;
    list.splice(pos,0,it);EFF[it.id]="in";
  }
  const slots={};list.forEach((it,i)=>{slots[i+1]=it;ASG[it.id]=i+1});
  return C[key]=slots;
}
function targetOf(it){return it.replaces||it.removes||it.moves||null}
// the passed vote that changed or removed this principle
function supersededBy(id){return Object.values(S.items).find(x=>(x.replaces===id||x.removes===id)&&effective(x)&&EFF[x.id]!=="void")}
function srcGone(f,text){return !f||!seatOf(f)||(text&&f.text!==text)}
function isVoid(it){if(it.voided)return true;
  if(it.kind==="promote"){if(isClosed(it)&&!tally(it).pass)return false;if(S.items["prov-"+it.id])return false;return srcGone(S.items[it.src],it.text)}
  if(!CAP[it.kind])return false;
  if(it.level==="prov"&&it.fromItem&&!isClosed(it)&&srcGone(S.items[it.fromItem],it.text))return true;
  seated(it.kind,it.level,it.cell);
  if(effective(it))return EFF[it.id]==="void";
  if(isClosed(it))return false;const tg=targetOf(it);return !!(tg&&S.items[tg]&&!seatOf(S.items[tg]))}
function voidCause(it){if(it.voidBy&&S.items[it.voidBy])return S.items[it.voidBy];
  if(it.kind==="promote"||(it.level==="prov"&&it.fromItem)){const f=it.kind==="promote"?it.src:it.fromItem;return supersededBy(f)||null}const tg=targetOf(it);if(tg)return supersededBy(tg);
  const vs=prinVersions(it.level,it.cell);const tm=isClosed(it)?it.closes:now();const before=vs.filter(v=>v.it.id!==it.id&&decidedAt(v.it)<=tm);return before.length?before[before.length-1].it:null}
function voidNoteHtml(it){if(it.kind==="promote"||(it.level==="prov"&&it.fromItem)){const vc=voidCause(it);return '<div class="voidnote"><b>Voided.</b> The grid\'s principle '+(vc?'was changed by <button type="button" class="tlink plain" data-act="open-item" data-v="'+vc.id+'">'+esc(pastAction(prinAction(vc)))+'</button>':'was changed or removed')+' before this finished, so it\'s no longer what the grid agreed to send. Voting closed early and votes on it don\'t count.</div>'}const vc=voidCause(it);const tg=targetOf(it);
  return '<div class="voidnote"><b>Void.</b> '+(vc?'<button type="button" class="tlink plain" data-act="open-item" data-v="'+vc.id+'">'+esc(pastAction(prinAction(vc)))+': '+esc(vc.text)+'</button> passed first, so '+(tg?'the principle this would change is gone.':'the list was already full.'):'Another vote passed first, so this has nothing left to change.')+' Voting closed early and votes on it don\'t count.</div>'}
function listBefore(cause,it){const vs=prinVersions(it.level,it.cell);const i=cause?vs.findIndex(v=>v.it.id===cause.id):-1;return i>0?vs[i-1].list:i===0?[]:(vs.length?vs[vs.length-1].list:[])}
const voidWritten=new Set();
const fullWritten=new Set();
function allLoaded(){const L=S.loaded||{};return L.cfg&&L.members&&L.votes&&L.ballots&&L.stamps&&L.rawItems&&L.ends}
function closeFull(){if(!S.db||S.readOnly||!allLoaded())return;for(const it of Object.values(S.items)){if(it.level==="prov"||isClosed(it)||it.voided||fullWritten.has(it.id))continue;const ids=eligibleIds(it);if(!ids.length)continue;let last=0,all=true;
  const bs=(BAL()[it.id]||[]);for(const b of bs)last=Math.max(last,b.t);
  if(bs.length<ids.length)continue; /* everyone eligible has voted: as many ballots on the hosts as eligible members (never this phone's unsent vote) */writeEnd(it,{closes:Math.min(now(),Math.max(last,it.at+1)),full:true},fullWritten)}
  // a vote on sending a principle BC-wide is settled once more than half of the whole grid has said Yes
  for(const it of Object.values(S.items)){if(it.kind!=="promote"||isClosed(it)||it.voided||fullWritten.has(it.id))continue;if(!tally(it).pass)continue;writeEnd(it,{closes:Math.min(now(),Math.max(decidedAt(it),it.at+1)),decided:true},fullWritten)}}
// Outcomes are their own records (ends/<item id>), written once by whichever member's app sees them first.
// The proposal itself is never rewritten, so nobody can reword someone else's proposal.
function writeEnd(it,end,seen){if(S.ends[it.id])return;seen.add(it.id);enqueue(()=>S.db.doc("ends/"+it.id).set(end)).catch(()=>seen.delete(it.id))}
function closeVoided(){if(!S.db||S.readOnly||!allLoaded())return;for(const it of Object.values(S.items)){if(!(it.kind==="principle"||it.kind==="promote")||it.voided||isClosed(it)||voidWritten.has(it.id))continue;if(!isVoid(it))continue;const c=voidCause(it);if(!c)continue;writeEnd(it,{voided:true,closes:now(),voidBy:c.id},voidWritten)}}
function seatOf(it){if(!CAP[it.kind])return null;const sl=seated(it.kind,it.level,it.cell);const k=Object.keys(sl).find(k=>sl[k].id===it.id);return k?Number(k):null}
function replacedBy(it){return Object.values(S.items).find(x=>x.replaces===it.id&&isClosed(x)&&tally(x).pass)}
function openOf(kind,level,cell){return Object.values(S.items).filter(i=>scopeMatch(i,kind,level,cell)&&!isClosed(i))}
function pastOf(kind,level,cell){return Object.values(S.items).filter(i=>scopeMatch(i,kind,level,cell)&&isClosed(i)).sort((a,b)=>b.closes-a.closes)}
function openProvFromCell(cell){return Object.values(S.items).find(i=>(i.level==="prov"&&i.fromCell===cell&&!isClosed(i))||(i.kind==="promote"&&i.cell===cell&&(!isClosed(i)||(tally(i).pass&&!S.items["prov-"+i.id]))))}
function cellCounts(){if(C.cc)return C.cc;const c={};for(const id in S.members){const m=S.members[id];c[m.cell]=(c[m.cell]||0)+1}return C.cc=c}

// ---------- teams: created/renamed/closed by vote; leads by election ----------
function teams(){
  if(C.tm)return C.tm;
  const mot=Object.values(S.items).filter(i=>i.kind==="office"&&["create","rename","close"].includes(i.act)&&isClosed(i)&&tally(i).pass).sort((a,b)=>a.closes-b.closes);
  const map={};
  for(const m of mot){
    if(m.act==="create")map[m.id]={id:m.id,cell:m.cell,name:m.name,purpose:m.purpose||"",start:m.closes,names:[{name:m.name,at:m.closes}],closedAt:null};
    else{const o=map[m.office];if(!o||o.closedAt)continue;if(m.act==="rename"){o.name=m.name;if(m.purpose)o.purpose=m.purpose;o.names.push({name:m.name,at:m.closes})}else o.closedAt=m.closes}
  }
  return C.tm=map;
}
function electionsOf(oid){return Object.values(S.items).filter(i=>isElection(i)&&i.office===oid).sort((a,b)=>a.at-b.at)}
function openElection(oid){return electionsOf(oid).find(e=>!isClosed(e))}
function electionCands(it){if(it.only&&it.only.length)return it.only.filter(id=>S.members[id]);return Object.keys(S.members).filter(id=>{const m=S.members[id];return m.cand&&m.cand[it.id]&&m.cell===it.cell})}
function leadHistory(o){
  const key="lh"+o.id;if(C[key])return C[key];
  const ev=[];
  electionsOf(o.id).forEach(e=>{if(isClosed(e)&&(!o.closedAt||e.closes<o.closedAt)){const t=tally(e);if(t.winner)ev.push({t:e.closes,k:"win",who:t.winner,item:e})}});
  Object.values(S.items).filter(i=>i.kind==="office"&&i.act==="recall"&&i.office===o.id&&isClosed(i)&&tally(i).pass).forEach(r=>ev.push({t:r.closes,k:"recall",who:r.target,item:r}));
  for(const id in S.members)(S.members[id].res||[]).forEach(x=>{if(x.o===o.id)ev.push({t:x.at,k:"resign",who:id})});
  if(o.closedAt)ev.push({t:o.closedAt,k:"closed"});
  ev.sort((a,b)=>a.t-b.t);
  const segs=[];let cur=null;
  for(const e of ev){
    if(e.k==="win"&&!cur){cur={lead:e.who,from:e.t,to:null,end:null,item:e.item};segs.push(cur)}
    else if(cur&&((e.k==="recall"||e.k==="resign")&&e.who===cur.lead||e.k==="closed")){cur.to=e.t;cur.end={recall:"Recalled by vote",resign:"Stepped down",closed:"Team closed"}[e.k];cur=null}
  }
  if(cur){const m=S.members[cur.lead];if(!m||m.cell!==o.cell){cur.to=m?m.joinedAt:now();cur.end="Left the grid";cur=null}}
  return C[key]={segs,lead:cur?cur.lead:null,since:cur?cur.from:null};
}
function meetingsByOffice(){const o={};for(const m of Object.values(S.meets)){if(!m.office)continue;(o[m.office]=o[m.office]||{meetings:[]}).meetings.push(m)}return o}
function staleMeeting(o){const ms=(S.odocs[o.id]&&S.odocs[o.id].meetings)||[];const base=ms.length?Math.max(...ms.map(m=>m.date||0)):o.start;return now()-base>92*864e5}

// ---------- map ----------
let mapN=0;
function bcMap(fill,opts){
  opts=opts||{};const id="bc"+(++mapN);const S_=G.S;let cells="",hits="",labels="",marks="";
  for(const c of LAND){const[r,k]=c.split("-").map(Number);const x=k*S_,y=r*S_;const f=fill?fill(c):null;
    cells+='<rect class="cellr'+(f&&f.cls?" "+f.cls:"")+'" x="'+x+'" y="'+y+'" width="'+S_+'" height="'+S_+'"/>';
    if(f&&f.label!=null&&f.label!=="")labels+='<text x="'+(x+S_/2)+'" y="'+(y+S_/2)+'"'+(f.dark?' class="on-dark"':'')+'>'+esc(f.label)+'</text>';
    if(opts.click)hits+='<rect class="hit" data-act="'+opts.click+'" data-v="'+c+'" x="'+x+'" y="'+y+'" width="'+S_+'" height="'+S_+'"><title>Grid '+cellName(c)+'</title></rect>';
  }
  const mc=myCell();if(mc&&!opts.noMe){const[r,k]=mc.split("-").map(Number);marks+='<rect class="me" x="'+(k*S_+4)+'" y="'+(r*S_+4)+'" width="'+(S_-8)+'" height="'+(S_-8)+'" rx="6"/>'}
  if(opts.sel){const[r,k]=opts.sel.split("-").map(Number);marks+='<rect class="sel" x="'+(k*S_)+'" y="'+(r*S_)+'" width="'+S_+'" height="'+S_+'" rx="6"/>'}
  if(opts.pulse){const[r,k]=opts.pulse.split("-").map(Number);marks+='<rect class="pulse cue" x="'+(k*S_)+'" y="'+(r*S_)+'" width="'+S_+'" height="'+S_+'" rx="6"/>'}
  const vb=opts.view||[-20,-20,G.W+40,G.H+40];
  // a name tag above one square (the selected grid), kept inside the visible part of the map
  if(opts.callout){const[r,k]=opts.callout.cell.split("-").map(Number);const t=opts.callout.text;const w=t.length*25+50,h=74;
    const cx=Math.max(vb[0]+w/2+8,Math.min(vb[0]+vb[2]-w/2-8,k*S_+S_/2)),cy=r*S_-h/2-14;
    labels+='<g class="callout"><rect x="'+(cx-w/2)+'" y="'+(cy-h/2)+'" width="'+w+'" height="'+h+'" rx="18"/><text x="'+cx+'" y="'+cy+'">'+esc(t)+'</text></g>'}
  return '<svg class="map" viewBox="'+vb.join(" ")+'" role="img" aria-label="Map of British Columbia divided into grids"><defs><clipPath id="'+id+'"><path d="'+G.path+'"/></clipPath></defs><path class="bcl" d="'+G.path+'"/><g clip-path="url(#'+id+')">'+cells+'</g><path class="outline" d="'+G.path+'"/>'+marks+labels+hits+'</svg>';
}

// ---------- shell ----------
const ICON={
  vote:'<svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/></svg>',
  plat:'<svg viewBox="0 0 24 24"><path d="M4 21h16M6 21V10M18 21V10M10 21V10M14 21V10M3 10l9-6 9 6"/></svg>',
  teams:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9.5" r="2.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M15 14.6c2.8-.4 5.3 1.1 6.3 4.4"/></svg>',
  map:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>',
  search:'<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V5h8v5M10 7.5l1.5 1.5L14.5 6"/></svg>',
  me:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>'};
function seg(name,opts,cur){return '<div class="seg" role="group">'+opts.map(o=>'<button type="button" data-act="'+name+'" data-v="'+o[0]+'" aria-pressed="'+(o[0]===cur)+'">'+esc(o[1])+'</button>').join("")+'</div>'}
function header(){let av='';const mm=S.me&&myMember();if(mm){av='<button type="button" class="meav" data-act="tab" data-v="me" aria-label="Your record"><span class="av">'+esc(initials(S.me))+'</span></button>'}const home=mm&&introSeen;return '<header class="hdr pad"><div class="hdr-top">'+(home?'<button type="button" class="brand2 brandbtn" data-act="goto-grid" data-v="'+esc(myCell()||"")+'" aria-label="Citizens Party: go to your grid"><b>Citizens Party</b></button>':'<div class="brand2"><b>Citizens Party</b></div>')+av+'</div></header>'}
function tabs(){const t=S.ui.tab;const e=me();const due=e?needsVote().length:0;const b=(k,l)=>'<button type="button" data-act="tab" data-v="'+k+'"'+(t===k?' aria-current="page"':'')+'><span class="ic">'+ICON[k]+(k==="vote"&&due?'<span class="dot">'+due+'</span>':'')+'</span>'+l+'</button>';return '<div class="tabs-in">'+b("plat","Grid")+b("search","Votes")+b("vote","Notifications")+'</div>'}
function inForm(){return S.ui.view&&(S.ui.view.type==="form"||S.ui.view.type==="feedback")}
let ptrDown=false,pendRender=false;
function hasSel(){try{const s=window.getSelection();return !!(s&&!s.isCollapsed&&String(s).trim())}catch(e){return false}}
document.addEventListener("pointerdown",()=>{ptrDown=true},true);
document.addEventListener("pointerup",()=>{ptrDown=false;if(pendRender)setTimeout(()=>{if(pendRender&&!ptrDown&&!hasSel()){pendRender=false;softRender()}},80)},true);
document.addEventListener("selectionchange",()=>{if(pendRender&&!ptrDown&&!hasSel()){pendRender=false;softRender()}});
function softRender(){if(ptrDown||hasSel()){pendRender=true;return}const a=document.activeElement;if(inForm())return;if(a&&(a.tagName==="INPUT"||a.tagName==="TEXTAREA")&&$("#app").contains(a))return;render()}
function render(){
  if(S.ui.frozen)return;
  C={};mapN=0;
  const app=$("#app"),tb=$("#tabs");
  if(!S.ready)return;
  if(!S.db||!S.me){app.innerHTML=header()+'<main class="main pad"><div class="card"><h1>Sign in to take part</h1><p class="lede" style="margin-top:8px">Citizens Party keeps a shared record of members, proposals and votes. Open this page while signed in to Claude to join your grid.</p></div></main>';tb.hidden=true;return}
  const v=S.ui.view;let body;
  if(!introSeen&&!S.ui.replay&&myMember()&&myMember().introAt)introSeen=true;
  const CA=window.CPAccount;if(!myMember()&&CA&&CA.synced&&(!CA.synced()||(CA.wasMember&&CA.wasMember()))&&!(v&&v.type==="form")){const off=CA.synced()&&CA.online&&!CA.online();app.innerHTML=header()+'<main class="main pad"><div class="loading" role="status"><span class="spin" aria-hidden="true"></span>'+(off?'Can\'t reach the party\'s hosts yet. Still trying…':'Loading your record…')+'</div></main>';tb.hidden=true;clearTimeout(render.lt);render.lt=setTimeout(render,400);return}
  if(!introSeen&&!(v&&v.type==="form"))body=S.ui.ts!=null?tourView():introView();
  else if(v&&v.type==="help")body=helpView();
  else if(v&&v.type==="feedback")body=feedbackView(v);
  else if(!myMember()&&!(v&&v.type==="form"))body=joinView();
  else if(v&&v.type==="form")body=formView(v);
  else if(v&&v.type==="item"&&S.items[v.id])body=itemView(S.items[v.id]);
  else if(v&&v.type==="team"&&teams()[v.id])body=teamView(teams()[v.id]);
  else if(v&&v.type==="hist")body=historyView(v.kind,v.level,v.cell);
  else if(v&&v.type==="scope")body=scopePickView();
  else if(v&&v.type==="gpick")body=gridPickView();
  else if(v&&v.type==="allvotes")body=allVotesView();
  else if(v&&v.type==="cast"&&S.items[v.id])body=castView(S.items[v.id]);
  else if(v&&v.type==="chain")body=chainView();
  else if(v&&v.type==="member"&&S.members[v.id])body=memberView(v.id);
  else if(S.ui.tab==="vote")body=voteHome();
  else if(S.ui.tab==="search")body=searchView();
  else if(S.ui.tab==="plat")body=platformView();
  else if(S.ui.tab==="teams")body=teamsView();
  else if(S.ui.tab==="map")body=mapView();
  else body=meView();
  const ro=S.readOnly?'<div class="banner">This account has view-only access. Ask the owner to share the page with edit access to vote.</div>':"";
  document.body.classList.toggle("touring",!introSeen&&!(v&&v.type==="form"));
  const y=window.scrollY;
  const top=myMember()&&introSeen&&!v&&S.ui.tab!=="me"?noticeCard(noticeList({grid:S.ui.tab==="plat"?platScope():null}),"tab-"+S.ui.tab):
    myMember()&&introSeen&&v&&v.type==="item"&&plainRoute()?noticeCard([{id:"priv",sig:"1",kind:"block",keep:true,html:PRIV_HTML}],"item"):""; // the vote page: the browser warning on top
  if(body.includes("<!--N-->"))body=body.replace("<!--N-->",top);else body=top+body;
  app.innerHTML=header()+'<main class="main pad">'+ro+body+'</main>';
  if(myMember()&&introSeen){tb.innerHTML=tabs();tb.hidden=inForm()}else tb.hidden=true;
  window.scrollTo(0,y);
  setupCarousels();
  fixMapLabels();autoSizeTA();setupPlDrag();setupVerSwipe();{const h=document.querySelector('.hdr');if(h)document.documentElement.style.setProperty('--hdrh',h.offsetHeight+'px');document.documentElement.style.setProperty('--tabh',(tb&&!tb.hidden?tb.offsetHeight:0)+'px');const th=document.querySelector('.tuthead');document.documentElement.style.setProperty('--tuth',(th?th.offsetHeight:0)+'px')}
  setupSwipe();setupNotices();fitTitle();
  resolveNames();
  closeVoided();closeFull();sealPending();
}
function go(view){if(S.ui.pe&&S.ui.pe.mode==="done"){S.ui.pe={};S.ui.amend=false}if(!S.ui.view||S.ui.view.type!=="form")S.ui.stack.push({view:S.ui.view||null,y:window.scrollY,car:Object.assign({},S.ui.car),tab:S.ui.tab,plat:S.ui.plat});S.ui.view=view;S.ui.pick=null;render();window.scrollTo(0,0)}
function canBack(){const v=S.ui.view;return !!(S.ui.stack.length||v||(v&&v.type==="item"&&S.ui.istage&&S.ui.istage[v.id]))}
function back(){S.ui.pick=null;{const v=S.ui.view;if(v&&v.type==="item"&&S.ui.istage&&S.ui.istage[v.id]==="ballot"){delete S.ui.istage[v.id];if(myVote(v.id)==null){render();window.scrollTo(0,0);return}}}let y=0,prev=null;while(S.ui.stack.length){const p=S.ui.stack.pop();if(!p.view||p.view.type!=="form"){prev=p.view;y=p.y;if(p.car)S.ui.car=Object.assign({},p.car);if(p.tab)S.ui.tab=p.tab;if("plat" in p)S.ui.plat=p.plat;break}}S.ui.view=prev;render();window.scrollTo(0,y);requestAnimationFrame(()=>window.scrollTo(0,y))}
function done(){S.ui.view=null;back()}
const backBtn='<button type="button" class="back" data-act="back">Back</button>';

// ---------- first-run intro + guided tour (nothing in the tour is saved) ----------
let introSeen=false;try{introSeen=localStorage.getItem("commons-intro-v2")==="1"}catch(e){}
function introDone(){S.ui.replay=false;S.ui.ts=null;S.ui.tx={};S.ui.pick=null;introSeen=true;try{localStorage.setItem("commons-intro-v2","1")}catch(e){}
  const m=myMember();if(m&&!m.introAt&&S.db&&!S.readOnly){const d=Object.assign({},clean(m),{introAt:now()});enqueue(()=>S.db.doc("members/"+S.me).set(d)).catch(()=>{})}
  S.ui.introStep=0;render();window.scrollTo(0,0)}
const ILL={
  people:'<svg viewBox="0 0 64 64"><circle cx="22" cy="22" r="8"/><circle cx="42" cy="22" r="8"/><path d="M8 50c1.5-9 7-14 14-14s12.5 5 14 14M28 50c1.5-9 7-14 14-14s12.5 5 14 14"/></svg>',
  grid:'<svg viewBox="0 0 64 64"><rect x="10" y="10" width="44" height="44" rx="6"/><path d="M10 25h44M10 39h44M25 10v44M39 10v44"/><rect x="25" y="25" width="14" height="14" class="fill"/></svg>',
  check:'<svg viewBox="0 0 64 64"><rect x="10" y="10" width="44" height="44" rx="10"/><path d="M21 33l8 8 15-17"/></svg>',
  done:'<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="22"/><path d="M22 33l7 7 14-15"/></svg>'};
// one nav bar for every tour screen: Back · step count (centered) · Skip
function tnav(pos,total,showBack){return '<div class="tutnav">'+(showBack?'<button type="button" class="tlink small tback" data-act="tour-back">Back</button>':'<span></span>')+'<span class="muted small tpos">'+(pos?pos+' of '+total:'')+'</span><button type="button" class="tlink small tskip" data-act="intro-done">Skip</button></div>'}
// coaching text lives only in these bubbles, so everything else on a tour screen looks like the real app
function ttip(h){return h?'<div class="ttip" role="note"><span class="ttl">Tour</span><p>'+h+'</p></div>':''}
const INTRO=[
  ["people","Your say, directly","Citizens Party is a political party run by its members. Members decide what they stand for and who leads their teams."],
  ["grid","Your grid","BC is split into 100 km squares called grids. You vote with your neighbours, and every grid counts equally across BC."],
  ["check","Your one duty","Vote on everything in your grid. Miss a vote and you go in the penalty box for a while."]];
function introView(){const van=PRAC_CELL;const top=Object.keys(PRAC).sort((x,y)=>PRAC[y]-PRAC[x]).slice(0,3);
  const ic={vote:'<svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V5h8v5M10 7.5l1.5 1.5L14.5 6"/></svg>',grid:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/><rect x="9" y="9" width="6" height="6" class="f"/></svg>',check:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 12l3 3 5-6"/></svg>'};
  const row=(i,b,t)=>'<li><span class="wic">'+ic[i]+'</span><span><b>'+b+'</b> '+t+'</span></li>';
  return '<div class="welcome"><div class="wtop"><button type="button" class="tlink small tskip" data-act="intro-done">Skip</button></div>'+
    '<div class="wmap">'+bcMap(id=>id===van?{cls:"f-pick",label:kfmt(PRAC[id]),dark:true}:PRAC[id]>=5000?{cls:"f-l",label:top.includes(id)?kfmt(PRAC[id]):""}:null,{noMe:true})+'</div>'+
    '<div class="wtext"><h1>Your say, directly</h1><p class="wsub">A BC political party run by its members.</p><ul class="wlist">'+
    row("vote","Members decide","what they stand for.")+row("grid","You vote with your grid,","a 100 km square of BC.")+row("check","One duty:","vote on everything in your grid.")+'</ul></div>'+
    '<div class="wfoot"><button type="button" class="btn pri block" data-act="tour-start">Take the tour · 2 min</button></div></div>';
}

// --- tour content ---
const T_PRIN=["Government exists to protect individual rights.","Children belong to their parents.","Property rights are human rights.","Free speech includes speech we disagree with.","Taxes should be as low as possible.","Decisions should be made as close to home as possible.","Every public dollar spent must be published online.","Healthcare decisions belong to patients and doctors."];
const T_FIRST="We should maximize the number of citizens who own land outright.";
function tFirst(){return S.ui.tourFirst||T_FIRST}
const T_INSERT="Every family should be able to own a home.";
const T_TENTH="Elected officials answer to voters, not parties.";
const T_POLICY={title:"Maximize land ownership",points:["Shift taxation from property to the GST.","Abolish all capital gains and transfer taxes on transfers within families.","Cut corporate tax by 25% for businesses operating outside a principal residence."]};
const T_PLAN={title:"Land Ownership Tax Plan",delivers:"Maximize land ownership",ops:[
  {op:"Repeal",ref:"Section 12.2 of the Tax Act"},
  {op:"Replace",ref:"Section 15.4 of the Tax Act",from:"An annual property tax is levied on the assessed value of all land and buildings.",to:"Property taxes are phased out over five years and replaced by an equivalent increase in the provincial share of the GST."}]};
const SIM={yes:957,no:8456,eligible:16520,min:150,mins:45};
function tx(){return S.ui.tx||(S.ui.tx={})}
function norm(t){return String(t).trim().replace(/\s+/g," ")}
function tbar(y,n,label,pre){return '<div class="tbar"><div class="bar big"><b class="y"'+(pre?' id="'+pre+'by"':'')+' style="width:'+(y*100)+'%"></b><b class="n"'+(pre?' id="'+pre+'bn"':'')+' style="width:'+(n*100)+'%"></b></div><i class="mk"></i><span class="mkl">'+label+'</span></div>'}
function explainScene(h,lede,facts,outro,roomy,btn){return {btn:btn||"Continue",render:()=>'<div class="explain'+(roomy?' roomy':'')+'"><h1>'+h+'</h1>'+(lede?'<p class="lede">'+lede+'</p>':'')+'<ul class="facts">'+facts.map(f=>'<li>'+f+'</li>').join("")+'</ul>'+(outro?'<p class="outro">'+outro+'</p>':'')+'</div>',ok:()=>true}}
function voteScene(label,cardHtml){return {vote:true,render:()=>{const st=tx();const pick=S.ui.pick&&S.ui.pick.id==="tut"?S.ui.pick.v:null;
  let h='<div class="votecard'+(st.voted?'':' swipe')+'" id="votecard" data-id="tut"><div class="cardtop">Practice · '+label+'</div>'+cardHtml+(st.voted?'<div class="cardvote '+(st.voted==="y"?'cv-y':'cv-n')+'">'+(st.voted==="y"?'✓ You voted Yes':'✕ You voted No')+'</div>':'<span class="stamp sy">YES</span><span class="stamp sn">NO</span>')+'</div>';
  if(!st.voted)h+=yesNo(pick,"tut-pick","")+'<p class="hint">'+(pick?'Tap '+(pick==="y"?"Yes":"No")+' again to confirm.':'Tap Yes or No, then tap it again to confirm.'+(isTouch()?' Or swipe the card.':''))+'</p>';
  else h+='<p class="tutmsg">Nice. In a real vote, that would be final.</p>';
  return h},ok:()=>!!tx().voted,btn:"Continue"}}
function plist(items,opts){opts=opts||{};return '<div class="plist">'+items.map((t,i)=>{const n=i+1;let row='';
  if(opts.plus)row+='<button type="button" class="pplus'+(opts.plus===n?' cue':'')+'" data-act="tx" data-v="plus" data-id="'+n+'" '+(opts.plus===n?'':'disabled')+' aria-label="Add a principle at #'+n+'">＋</button>';
  const cls=(opts.newAt===n?' isnew':'')+(opts.gone===n?' isgone':'');
  row+='<div class="prow'+cls+'"><span class="pn">'+n+'</span><span class="pt">'+esc(t)+(opts.newAt===n?' <span class="chip warn">Proposed</span>':'')+(opts.gone===n?' <span class="chip no">Removal proposed</span>':'')+'</span>'+
    (opts.edit?'<button type="button" class="picon" data-act="tx" data-v="edit" data-id="'+n+'" aria-label="Edit #'+n+'">✎</button>':'')+
    (opts.del?'<button type="button" class="picon" data-act="tx" data-v="del" data-id="'+n+'" aria-label="Remove #'+n+'">🗑</button>':'')+'</div>';
  if(opts.editing===n)row+='<div class="peditor"><label class="f" for="tx-in">New wording for #'+n+'<input class="inp" id="tx-in" value="'+esc(opts.editVal||t)+'"></label><button type="button" class="btn pri block" data-act="tx" data-v="edit-go" id="tx-go" disabled>Put the new wording to a vote</button></div>';
  if(opts.deleting===n)row+='<div class="peditor"><p style="margin:0">Propose removing #'+n+'?</p><div class="row2"><button type="button" class="btn" data-act="tx" data-v="del-cancel">Cancel</button><button type="button" class="btn danger" data-act="tx" data-v="del-go">Put removal to a vote</button></div></div>';
  return row}).join("")+'</div>'}
const V1={members:16520,min:826,yes:5940,no:2710,hours:72};
function factList(a){return '<ul class="facts">'+a.map(x=>'<li>'+x+'</li>').join("")+'</ul>'}
function voteFacts(o){const f=n=>Number(n).toLocaleString();const need=Math.floor(o.members/2)+1;const out=[];
  if((o.y+o.n)<o.min){out.push(f(o.y+o.n)+' of '+f(o.members)+' eligible members have voted so far.');out.push('Yes and No counts stay hidden until '+f(o.min)+' votes are in, so no one can work out how an early voter voted.');out.push('It still needs '+f(o.min-o.y-o.n)+' more vote'+(o.min-o.y-o.n===1?'':'s')+' to reach the minimum turnout.');return factList(out)}
  out.push(o.closed?f(o.y)+' voted for it'+(o.n>o.y?', but ':' and ')+f(o.n)+' voted against it.':f(o.y)+' have voted for it and '+f(o.n)+' against it so far.');
  out.push((o.y+o.n)>=o.min?'It '+(o.closed?'met':'has met')+' the minimum turnout of '+f(o.min)+' votes.':'It still needs '+f(o.min-o.y-o.n)+' more votes to reach the minimum turnout of '+f(o.min)+'.');
  if(o.decided&&!o.closed)out.push(o.decided==="pass"?'It\'s already decided: more than half of the whole grid voted Yes, so it took effect right away. Voting stays open for the record'+(o.left?' for another '+o.left:'')+'.':'It\'s already decided: it can no longer reach a majority. Voting stays open for the record'+(o.left?' for another '+o.left:'')+'.');
  else if(o.early)out.push('It was called '+(o.earlyText||'early')+', once 51% of all eligible voters had voted '+(o.y>o.n?'Yes':'No')+'.');
  else if(o.closed&&o.full)out.push('Every eligible member voted, so voting closed early.');
  else if(o.closed)out.push('Neither side reached 51% of the grid before voting closed, so it '+(o.y>o.n?'passed':'failed')+' with '+Math.round(100*Math.max(o.y,o.n)/Math.max(1,o.y+o.n))+'% of votes cast.');
  else out.push('It is decided early as soon as one side reaches 51% of the grid ('+f(need)+' votes), or once everyone has voted. Otherwise it runs to the end'+(o.left?', in '+o.left:'')+'.');
  return factList(out)}
const PRAC_CELL=TOWN_CELL["Vancouver"];
const TOUR_DONE='Go to the <button type="button" class="tlink ul cue" data-act="tx" data-v="tovote">votes</button> page to see how everyone else sees it.';
const PRAC=(()=>{const c={};for(const id of LAND){const h=hash("pc"+id);const big=TOWNS.some(t=>TOWN_CELL[t[0]]===id&&BIG.includes(t[0]));c[id]=big?900+h%6800:(h%3?30+h%420:0)}c[PRAC_CELL]=16520;return c})();
function kfmt(n){return n>=1000?Math.round(n/1000)+"k":String(n)}
function gridCard(cell,d){const towns=townsIn(cell);return '<div class="card gridcard"><h2>'+esc(gridName(cell))+(d.mine?' (yours)':'')+'</h2><div class="kv" style="margin-top:6px"><span>Members</span><span>'+Number(d.members||0).toLocaleString()+'</span></div><div class="kv"><span>Principles adopted</span><span>'+d.prin+' / 10</span></div><p class="muted small" style="margin:8px 0 0">'+(towns.length?'Includes '+esc(towns.join(", ")):'No listed towns')+'</p></div>'}
const V2={members:16520,min:150,yes:957,no:8456,hours:72,earlyMins:45,ky:3,kn:2.2};
const CLOCK='<svg class="clk" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line id="sc-hand" x1="12" y1="12" x2="12" y2="5.5"/><circle cx="12" cy="12" r="1.3" class="dot"/></svg>';
function simTime(cfg,p,done){
  if(cfg.earlyMins){if(done)return 'Called early, after '+cfg.earlyMins+' minutes';const m=Math.round(cfg.earlyMins*p);return left((cfg.hours*60-m)*6e4)}
  if(done)return 'Closed just now';return left(Math.max(6e4,cfg.hours*(1-p)*36e5))}
function simDeg(cfg,p){return cfg.earlyMins?6*cfg.earlyMins*p:360*6*p}
// one vote, shown the way a real vote page looks
// cumulative Yes/No over the voting window (No voters show up early, Yes catches up)
function simSeries(cfg){if(cfg._ser)return cfg._ser;const N=160,ky=cfg.ky||2.2,kn=cfg.kn||9;const f=(k,t)=>(1-Math.exp(-k*t))/(1-Math.exp(-k));
  const ser=[];for(let i=0;i<=N;i++){const t=i/N;ser.push([Math.round(cfg.yes*f(ky,t)),Math.round(cfg.no*f(kn,t))])}return cfg._ser=ser}
const CH={x0:40,x1:312,y0:10,y1:118};
function chMax(cfg){return cfg.share?100:cfg.earlyMins||cfg.thr?cfg.members*0.6:Math.max(cfg.yes,cfg.no)*1.1}
function shareAt(ser,i,side){let p=ser[i];if(p[0]+p[1]===0)p=ser[Math.min(1,ser.length-1)];const c=p[0]+p[1];return c?p[side]/c*100:50}
function chPts(cfg,k,side){const ser=simSeries(cfg),N=ser.length-1,M=chMax(cfg);let pts='';for(let i=0;i<=k&&i<=N;i++){const x=CH.x0+(CH.x1-CH.x0)*i/N,val=cfg.share?shareAt(ser,i,side):ser[i][side],y=CH.y1-(CH.y1-CH.y0)*val/M;pts+=x.toFixed(1)+','+y.toFixed(1)+' '}return pts}
function simChart(cfg,k){const M=chMax(cfg);const ticks=cfg.earlyMins?['0','15m','30m','45m']:['0h','24h','48h','72h'];
  const yl=v=>cfg.share?Math.round(v)+'%':v>=1000?Math.round(v/1000)+'k':String(Math.round(v));
  let g='<line class="ax" x1="'+CH.x0+'" y1="'+CH.y1+'" x2="'+CH.x1+'" y2="'+CH.y1+'"/><text class="tl" x="'+(CH.x0-6)+'" y="'+(CH.y1+4)+'" text-anchor="end">'+(cfg.share?'0%':'0')+'</text><text class="tl" x="'+(CH.x0-6)+'" y="'+(CH.y0+8)+'" text-anchor="end">'+yl(M)+'</text>';
  if(cfg.share){const y=CH.y1-(CH.y1-CH.y0)*51/100;g+='<line class="th" x1="'+CH.x0+'" y1="'+y+'" x2="'+CH.x1+'" y2="'+y+'"/><text class="tl" x="'+(CH.x0+4)+'" y="'+(y-4)+'">51% of votes cast needed to pass</text>'}
  ticks.forEach((t,i)=>{const x=CH.x0+(CH.x1-CH.x0)*i/(ticks.length-1);g+='<text class="tl" x="'+x+'" y="'+(CH.y1+16)+'" text-anchor="'+(i===0?'start':i===ticks.length-1?'end':'middle')+'">'+t+'</text>'});
  if(!cfg.share&&(cfg.earlyMins||cfg.thr)){const y=CH.y1-(CH.y1-CH.y0)*(cfg.members*0.51)/M;g+='<line class="th" x1="'+CH.x0+'" y1="'+y+'" x2="'+CH.x1+'" y2="'+y+'"/><text class="tl" x="'+(CH.x0+4)+'" y="'+(y-4)+'">51% of the grid decides it</text>'}
  return '<svg class="simchart" viewBox="0 0 320 140" role="img" aria-label="Yes and No votes over time">'+g+'<polyline id="sc-ln" class="ln" points="'+chPts(cfg,k,1)+'"/><polyline id="sc-ly" class="ly" points="'+chPts(cfg,k,0)+'"/></svg>'}
// cumulative Yes/No for a real vote, sampled from ballot timestamps
function liveSeries(it){const pts=ballotsOf(it).map(b=>[b.t,b.v]);
  pts.sort((a,b)=>a[0]-b[0]);const ser=[[0,0]];let y=0,n=0;
  if(!pts.length)return{ser,count:0,span:0,byOrder:true};
  const t0=pts[0][0],t1=pts[pts.length-1][0];
  if(t1-t0<60e3*pts.length){pts.forEach(p=>{p[1]==="y"?y++:p[1]==="n"?n++:0;ser.push([y,n])});return{ser,count:pts.length,span:t1-t0,byOrder:true}}
  const N=60;let j=0;for(let i=1;i<=N;i++){const t=t0+(t1-t0)*i/N;while(j<pts.length&&pts[j][0]<=t){pts[j][1]==="y"?y++:pts[j][1]==="n"?n++:0;j++}ser.push([y,n])}
  return{ser,count:pts.length,span:t1-t0,t0,t1}}
function liveTicks(L){if(L.byOrder)return['1st vote','','Vote #'+L.count];const f=t=>new Date(t).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric"});return[f(L.t0),'',f(L.t1)]}
function lineChart(ser,o){if(o.share){ser=ser.map((p,i)=>[shareAt(ser,i,0),shareAt(ser,i,1)]);o=Object.assign({},o,{max:100,thr:51,thrLabel:"51% of votes cast needed to pass",pct:true})}const M=Math.max(1,o.max||Math.max(o.thr?o.thr*1.15:0,Math.max(...ser.map(p=>Math.max(p[0],p[1])))*1.1));const N=ser.length-1;
  const pts=side=>ser.map((p,i)=>(CH.x0+(CH.x1-CH.x0)*i/Math.max(1,N)).toFixed(1)+','+(CH.y1-(CH.y1-CH.y0)*p[side]/M).toFixed(1)).join(' ');
  const yl=v=>o.pct?Math.round(v)+'%':v>=1000?Math.round(v/1000)+'k':String(Math.round(v));const ticks=o.ticks||['Start','','Now'];
  let g='<line class="ax" x1="'+CH.x0+'" y1="'+CH.y1+'" x2="'+CH.x1+'" y2="'+CH.y1+'"/><text class="tl" x="'+(CH.x0-6)+'" y="'+(CH.y1+4)+'" text-anchor="end">0</text><text class="tl" x="'+(CH.x0-6)+'" y="'+(CH.y0+8)+'" text-anchor="end">'+yl(M)+'</text>';
  ticks.forEach((t,i)=>{if(!t)return;const x=CH.x0+(CH.x1-CH.x0)*i/(ticks.length-1);g+='<text class="tl" x="'+x+'" y="'+(CH.y1+16)+'" text-anchor="'+(i===0?'start':i===ticks.length-1?'end':'middle')+'">'+t+'</text>'});
  if(o.thr){const y=CH.y1-(CH.y1-CH.y0)*o.thr/M;g+='<line class="th" x1="'+CH.x0+'" y1="'+y+'" x2="'+CH.x1+'" y2="'+y+'"/><text class="tl" x="'+(CH.x0+4)+'" y="'+(y-4)+'">'+(o.thrLabel||'51% of the grid decides it')+'</text>'}
  if(o.blank)return '<svg class="simchart" viewBox="0 0 320 140" aria-hidden="true">'+g+'</svg>';
  return '<svg class="simchart" viewBox="0 0 320 140" role="img" aria-label="Yes and No votes over time">'+g+'<polyline class="ln" points="'+pts(1)+'"/><polyline class="ly" points="'+pts(0)+'"/></svg>'}
function liveChartBlock(it){if(it.kind==="office"&&it.act==="election")return "";const L=liveSeries(it);const min=Math.max(1,S.cfg.minVoters||1);
  if(L.count<min)return '<div class="card wc"><div class="wch">Votes over time</div><p class="muted small" style="margin:0">The chart appears once '+min+' votes are in ('+L.count+' so far).</p></div>'+(it.level==="prov"?'':(()=>{const t=tally(it);return voteFacts({closed:isClosed(it),y:t.y,n:t.n,min:t.min,members:t.eligible,decided:t.early,left:isClosed(it)?'':left(it.closes-now()).replace(/ left$/,''),hours:Math.round((it.closes-it.at)/3600e3)})})());
  const h=L.span/3600e3;const end=isClosed(it)?'Closed':'Now';const ticks=['Start',h>=48?Math.round(h/2)+'h':'',end];
  const last=L.ser[L.ser.length-1];
  const t=tally(it);const need=Math.floor(t.eligible/2)+1;
  return '<div class="card wc"><div class="wch">Votes over time</div>'+lineChart(L.ser,{ticks})+'<div class="secthd small"><span style="color:var(--yes);font-weight:700">Yes '+last[0]+'</span><span style="color:var(--no);font-weight:700">No '+last[1]+'</span></div></div>'+
  (true?'':voteFacts({closed:isClosed(it),y:t.y,n:t.n,min:t.min,members:t.eligible,decided:t.early,left:isClosed(it)?'':left(it.closes-now()).replace(/ left$/,''),hours:Math.round((it.closes-it.at)/3600e3)}))}
function v1Details(st){const t1=st.doneAt||Date.now(),t0=st.votedAt||t1;return detailCard([['Proposed by','You'],['Proposed',fdt(t0)],['Voting closed',fdt(t1)],['Supporters','<span class="kvy">✓ Reached</span>'],['Your vote',st.voted==='y'?'<span class="kvy">Yes</span>':st.voted==='n'?'<span class="kvn">No</span>':'<span class="muted">Not yet</span>']])}
function simChip(label){return chipHead(/^Remove/.test(label)?"Delete":/^Move/.test(label)?"Move":/^Reword/.test(label)?"Replace":"Add",gridName(PRAC_CELL))}
// one ballot card, the same on the tour and in the app: time left in the corner, the principle, how you voted,
// then (once there are numbers) the chart, and "x of y voted" at the bottom
function vcard(o){return '<div class="card vc1"'+(o.id?' id="'+o.id+'"':'')+'><div class="vc1-top">'+(o.chip||'<span></span>')+'<span class="vleft"'+(o.leftId?' id="'+o.leftId+'"':'')+'>'+o.left+'</span></div>'+(o.pre||'')+'<p class="cardtext">'+esc(o.text)+'</p>'+
  (o.mine?'<div class="cardvote '+(o.mine==="y"?'cv-y':'cv-n')+(o.pop?' pop':'')+'"><i aria-hidden="true">'+(o.mine==="y"?IC.check:IC.x)+'</i>'+(o.mine==="y"?'You voted Yes':'You voted No')+'</div>':'')+(o.mid||'')+'<div class="vc1-foot">'+o.foot+'</div></div>'}
// before there are numbers to chart: how close it is to the endorsements it needs
function supLine(have,need,ids){const f=have==null?0:Math.min(1,have/Math.max(1,need));const N=need.toLocaleString();return '<div class="gprog"'+(ids?' id="sc-prog"':'')+'><div class="gp-l"><b>Needs '+N+' supporter'+(need===1?'':'s')+'</b> before the whole grid votes on it.</div><div class="gp-bar"><b'+(ids?' id="sc-supb"':'')+' style="width:'+(f*100).toFixed(1)+'%"></b></div>'+(have==null?'':'<div class="gp-n"><span'+(ids?' id="sc-sup"':'')+'>'+have.toLocaleString()+'</span> of '+N+'</div>')+'</div>'}
// results stay hidden until enough people have voted: a faded chart with a lock
const LOCK='<svg class="lk" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
function lockChart(n,need,prov){return '<div class="lockchart"><svg class="lc-fake" viewBox="0 0 300 90" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,80 40,70 80,72 120,52 160,58 200,38 240,44 300,24" fill="none" stroke="currentColor" stroke-width="3"/><polyline points="0,84 40,80 80,82 120,74 160,78 200,70 240,72 300,66" fill="none" stroke="currentColor" stroke-width="3" opacity=".5"/></svg>'+
  '<div class="lc-msg">'+LOCK+'<span>'+(prov?'Results unlock once '+MIN_GRIDS+' grids report · <b>'+n+'/'+MIN_GRIDS+'</b>':'Results unlock at '+need+' votes · <b>'+Math.min(n,need)+'/'+need+'</b>')+'</span></div>'+
  '<details class="why"><summary>Why?</summary><p>'+(prov?'A grid reports once '+S.cfg.minVoters+' of its members have voted, so nobody can work out how a few people voted.':'So nobody can work out how the first few people voted.')+'</p></details></div>'}
function ynLine(y,n,pct,ids){const p=Math.round(100*y/Math.max(1,y+n));return '<div class="secthd small"><span style="color:var(--yes);font-weight:700">Yes <span'+(ids?' id="sc-y"':'')+'>'+y.toLocaleString()+'</span>'+(pct?' <span class="pct">· '+p+'%</span>':'')+'</span><span style="color:var(--no);font-weight:700">No <span'+(ids?' id="sc-n"':'')+'>'+n.toLocaleString()+'</span>'+(pct?' <span class="pct">· '+(100-p)+'%</span>':'')+'</span></div>'}
function simCard(cfg,text,st,my){const done=!!st.simDone;
  const y=done?cfg.yes:(my==="y"?1:0),n=done?cfg.no:(my==="n"?1:0),cast=y+n;const tot=cfg.yes+cfg.no;const N=simSeries(cfg).length-1;const pass=cfg.yes>cfg.no;
  const chip=done?(pass?'<span class="chip yes">Passed</span>':'<span class="chip no">Rejected</span>'):'<span class="chip warn" id="sc-chip">Gathering support</span>';
  const foot=done&&cfg.link?'<button type="button" class="tlink small plain cue" data-act="tx" data-v="breakdown">'+tot.toLocaleString()+' of '+cfg.members.toLocaleString()+' voted ›</button>':'<span class="muted small"><span id="sc-cast">'+cast.toLocaleString()+'</span> of '+cfg.members.toLocaleString()+' voted</span>';
  // laid out like a real vote page: the vote card, then a card for supporters and results
  const res=done?'<div class="card results"><p class="outsum"><b>'+(pass?'Passed.':'Rejected.')+'</b> '+(pass?'It had enough supporters, and a majority voted Yes.':'It went to a full vote but didn\'t get a majority.')+'</p>'+simChart(cfg,N)+ynLine(y,n,true)+'</div>':
    '<div class="card results">'+supLine(y,cfg.min,true)+'<div id="sc-chart" hidden><p class="gofull">✓ Going to a full vote · 51% needed to pass</p>'+simChart(cfg,0)+ynLine(y,n,false,true)+'</div></div>';
  return vcard({chip,left:simTime(cfg,done?1:0,done),leftId:"sc-t",text,mine:my,foot})+res}
function simRun(cfg){const st=tx();if(st.simming||st.simDone)return;st.simming=true;render();
  const t0=performance.now(),D=8000;const ser=simSeries(cfg),N=ser.length-1;
  const set=(id,val)=>{const x=document.getElementById(id);if(x)x.textContent=val};
  const tick=()=>{if(S.ui.tx!==st)return;const p0=Math.min(1,(performance.now()-t0)/D);const p=Math.pow(p0,2.4);
    const k=Math.round(p*N);const y=ser[k][0],n=ser[k][1],cast=y+n;
    // the chart only appears once the proposal has the support it needs; until then, a progress line
    const ok=y>=cfg.min;set("sc-sup",Math.min(y,cfg.min).toLocaleString());{const b=document.getElementById("sc-supb");if(b)b.style.width=(Math.min(1,y/cfg.min)*100).toFixed(1)+"%"}
    if(ok){const pr=document.getElementById("sc-prog"),ch=document.getElementById("sc-chart"),cp=document.getElementById("sc-chip");if(pr)pr.hidden=true;if(ch)ch.hidden=false;if(cp)cp.hidden=true}
    set("sc-y",y.toLocaleString());set("sc-n",n.toLocaleString());set("sc-cast",cast.toLocaleString());set("sc-t",simTime(cfg,p,false));
    const ly=document.getElementById("sc-ly"),ln=document.getElementById("sc-ln");if(ly){ly.setAttribute("points",chPts(cfg,k,0));ln.setAttribute("points",chPts(cfg,k,1))}
    if(p0<1)requestAnimationFrame(tick);else{st.simming=false;st.simDone=true;st.doneAt=Date.now();render()}};
  requestAnimationFrame(tick)}
function speedBtn(){const st=tx();return '<button type="button" class="btn pri block" data-act="tx" data-v="sim" '+(st.simming?'disabled':'')+'>'+(st.simming?'Speeding up…':'Speed up')+'</button>'}
function ledgerRows(cfg,hoursSpan,from,to){const rows=[];const tot=cfg.yes+cfg.no;const end=Date.now()-3600e3;const N=tot-1;
  for(let i=from;i<Math.min(to,N);i++){const id="tour"+cfg.yes+"-"+i;const v=(hash(id)%tot)<cfg.yes?"y":"n";rows.push({code:voterCode(id),t:new Date(end-(hoursSpan*3600e3)*(1-i/N)),v,fp:receipt(id,"tour",v,i)})}return rows}
// end a sentence after a time without doubling the period ("8:56 p.m." already ends in one)
const dot=t=>/[.!?]$/.test(String(t))?String(t):t+".";
function tstamp(d,withDay){return withDay?d.toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):d.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})}
// the tour's copy of the Grid page: map, overview, then one featured section
function townsLine(tw){return tw.length?esc(tw.slice(0,3).join(", "))+(tw.length>3?' +'+(tw.length-3)+' more':''):''}
function pracHead(prin){const van=PRAC_CELL;
  return '<div class="ghead">'+'<span class="minimap">'+bcMap(id=>id===van?{cls:"f-pick"}:null,{noMe:true})+'</span><div class="ghead-t"><h1 class="gtitle"><span>'+esc(gridName(van))+'</span><small class="gmine">(practice grid)</small></h1>'+
  '<p class="gsum">'+townsLine(townsIn(van))+'</p></div></div>'+
  '<div class="stats gstats"><div class="stat"><b>'+kfmt(PRAC[van])+'</b><span>Members</span></div><div class="stat"><b>'+(prin||0)+'<small>/10</small></b><span>Principles</span></div><div class="stat"><b>0</b><span>Open votes</span></div></div>'}
// southern BC, zoomed in so the Vancouver square is a good size for a finger
const PICK_VIEW=[590,390,1050,950];
function pracMap(click,sel){const van=PRAC_CELL;
  return bcMap(id=>id===van?(sel?{cls:"f-pick"}:{cls:"f-pick",label:kfmt(PRAC[id]),dark:true}):PRAC[id]>=5000?{cls:"f-l",label:kfmt(PRAC[id])}:null,
    {click,pulse:sel?null:van,sel:sel?van:null,callout:sel?{cell:van,text:gridName(van)+' · '+kfmt(PRAC[van])}:null,noMe:true,view:PICK_VIEW})}
function gridMock(section,prin){return '<div class="tgrid">'+pracHead(prin)+'<div class="pills" role="tablist" aria-label="Practice grid tabs"><button type="button" role="tab" aria-pressed="true" tabindex="-1">Principles <span class="tcount">'+(prin||0)+'</span></button><button type="button" role="tab" aria-pressed="false" tabindex="-1" disabled>Workshops</button><button type="button" role="tab" aria-pressed="false" tabindex="-1" disabled>Roles</button><button type="button" role="tab" aria-pressed="false" tabindex="-1" disabled>Members <span class="tcount">'+kfmt(PRAC[PRAC_CELL])+'</span></button></div><section class="tsec" id="tsec">'+section+'</section></div>'}
function autoSizeTA(){document.querySelectorAll(".prow.first1 textarea.inp").forEach(t=>{t.style.height="auto";t.style.height=t.scrollHeight+2+"px"})}
function fixMapLabels(){document.querySelectorAll("svg.map").forEach(svg=>{const path=svg.querySelector("path.bcl");if(!path||!path.isPointInFill)return;const S_=G.S;
  const inside=(a,b)=>{try{const p=svg.createSVGPoint();p.x=a;p.y=b;return path.isPointInFill(p)}catch(e){return true}};
  let tag=null;const cg=svg.querySelector(".callout rect");if(cg){try{tag=cg.getBBox()}catch(e){}}
  // number labels sit fully on BC's land, never in the sea or past the border, and never under the name tag
  svg.querySelectorAll("text").forEach(t=>{if(t.closest(".callout"))return;const x=+t.getAttribute("x"),y=+t.getAttribute("y");
    let bb;try{bb=t.getBBox()}catch(e){return}const hw=bb.width/2+4,hh=bb.height/2;
    const clear=(a,b)=>!tag||a+hw<tag.x||a-hw>tag.x+tag.width||b+hh<tag.y||b-hh>tag.y+tag.height;
    const ok=(a,b)=>inside(a-hw,b-hh)&&inside(a+hw,b-hh)&&inside(a-hw,b+hh)&&inside(a+hw,b+hh)&&inside(a,b)&&clear(a,b);
    if(ok(x,y))return;const st=S_/4;for(const [dx,dy] of [[0,-st],[0,st],[-st,0],[st,0],[-st,-st],[st,-st],[-st,st],[st,st]]){if(ok(x+dx,y+dy)){t.setAttribute("x",x+dx);t.setAttribute("y",y+dy);return}}
    t.remove()})})}
function pagerHtml(pg,pages){const set=new Set([0,pages-1,pg-1,pg,pg+1].filter(i=>i>=0&&i<pages));const ks=[...set].sort((a,b)=>a-b);let h='',last=-1;
  for(const k of ks){if(k-last>1)h+='<span class="pgdots">…</span>';h+='<button type="button" class="pgn'+(k===pg?' on':'')+'" data-act="tx" data-v="pgto" data-id="'+k+'"'+(k===pg?' aria-current="page"':'')+'>'+(k+1)+'</button>';last=k}
  return '<div class="pager2"><button type="button" class="pgn" data-act="tx" data-v="pg" data-id="-1" aria-label="Previous page" '+(pg>0?'':'disabled')+'>‹</button>'+h+'<button type="button" class="pgn" data-act="tx" data-v="pg" data-id="1" aria-label="Next page" '+(pg<pages-1?'':'disabled')+'>›</button></div>'}
function slotRows(first){return first+'<p class="muted small slotmore">+ 9 more empty slots</p>'}

// ---------- principle list: one component for the tour and the Platform page ----------
// items: [{text,id}] in order; st: editing state; o: {act, canEdit (amend mode), cap, addVal, doneMsg, viewAct, rows, move, only}
function plRow(n,t,o,amend,extra){
  const view=!amend&&o.viewAct;
  const a=view?' role="button" tabindex="0" data-act="'+o.act+'" data-v="row" data-id="'+n+'"':'';
  let tools='';
  if(amend&&o.rows!==false){const on=k=>!o.only||o.only===k;const show=k=>!o.only||k==="reword"||o.only===k||(o.only==="move"&&k==="remove");
    const ed=show("reword")?'<button type="button" class="pico" data-act="'+o.act+'" data-v="edit" data-id="'+n+'" aria-label="Reword #'+n+'" title="Reword" '+(on("reword")?'':'disabled')+'>✎</button>':'';
    const rm=show("remove")&&o.only!=="reword"?'<button type="button" class="pico" data-act="'+o.act+'" data-v="del" data-id="'+n+'" aria-label="Remove #'+n+'" title="Remove" '+(on("remove")?'':'disabled')+'>✕</button>':'';
    const gr=o.move&&(!o.only||o.only==="move")&&!(o.len<2)?'<button type="button" class="pico grip" data-grip="'+n+'" aria-label="Drag to move #'+n+'" title="Drag to move">⠿</button>':'';
    const bcb=o.bc&&!o.only?(()=>{const id=o.ids&&o.ids[n-1];const why=id?bcBlock(id):"";return '<button type="button" class="pico bcp" data-act="promote" data-id="'+(id||'')+'" aria-label="Send #'+n+' to BC" title="'+esc(why||'Send to a BC-wide vote')+'" '+(why?'disabled':'')+'>↑BC</button>'})():'';
    tools='<span class="ptools">'+ed+rm+gr+bcb+'</span>'}
  return '<div class="prow'+(view?' tap':'')+(amend?' amend':'')+(extra||'')+'"'+a+' data-n="'+n+'"><span class="pn">'+n+'</span><span class="pt">'+esc(t)+(o.tag&&o.ids&&o.ids[n-1]?o.tag(o.ids[n-1]):'')+'</span>'+tools+'</div>'}
function plEmpty(n,o,tap){const a=tap?' role="button" tabindex="0" data-act="'+o.act+'" data-v="gap" data-id="'+n+'" aria-label="Propose a principle at #'+n+'"':'';return '<div class="prow pempty'+(tap?' tap':'')+'"'+a+'><span class="pn">'+n+'</span><span class="pt">'+(tap?'Empty · '+(isTouch()?'tap':'click')+' to propose one here':'Empty')+'</span></div>'}
function plIns(pos,o){return '<button type="button" class="pins" data-act="'+o.act+'" data-v="gap" data-id="'+pos+'" aria-label="Propose a principle in slot '+pos+'"><span>'+(isTouch()?'＋ Add a principle at #'+pos:'<b class="pn">'+pos+'</b>Empty · click to propose one here')+'</span></button>'}
function plReceipt(d,o){if(o.act==="pe")return '<div class="prcpt1" role="status"><span>✓ '+esc(d.what)+' · '+dot(tstamp(new Date(d.ts),true))+' '+(d.id?'<button type="button" class="tlink small plain" data-act="open-item" data-v="'+d.id+'">View its vote ›</button>':'It\'s on the Votes tab.')+'</span><button type="button" class="btn small-btn" data-act="pe" data-v="finish">Done</button></div>';
  if(o.act==="tx")return '<div class="prcpt1" role="status"><span>✓ '+esc(d.what)+' · '+dot(tstamp(new Date(d.ts),true))+' <button type="button" class="tlink small plain cue" data-act="tx" data-v="tovote">View its vote ›</button></span></div>';
  return '<div class="prcpt" role="status"><div class="rh">✓ '+esc(d.what)+'</div><span class="small muted">Proposal receipt · '+tstamp(new Date(d.ts),true)+'</span><span class="code muted">'+esc(d.fp)+'</span><p>'+(o.doneMsg||'It\'s now on the votes page. The list only changes if it passes.')+'</p></div>'}
function plList(items,st,o){st=st||{};const cap=o.cap||10;const texts=items.map(x=>x.text);
  const blur=h=>h?'<div class="blurred" aria-hidden="true">'+h+'</div>':'';
  const rowsRange=(from,to,offset)=>{let h='';for(let i=from;i<to;i++)h+=plRow(i+1+(offset||0),texts[i],o,false);return h};
  const empties=(from,count)=>{let h='';for(let k=from;k<from+count&&k<=cap;k++)h+=plEmpty(k,o,false);return h};
  let m=st.mode;const len=texts.length;
  if(m==="add"||(m==="done"&&st.done&&st.done.kind==="add")){const at=st.at;
    const focus=m==="add"?plEditor(at,st.val!=null?st.val:(o.addVal||""),"add-go","Propose this principle",o,""):plLocked(at,st.done.text,false,o,st.done);
    return '<div class="card wc plbox"><div class="plist compact">'+blur(rowsRange(0,at-1))+focus+blur(rowsRange(at-1,len,1)+empties(len+2,cap-len-1))+'</div></div>'}
  if((m==="move"||(m==="done"&&st.done&&st.done.kind==="move"))&&st.n){const f=st.n-1,to=st.to-1;const moved=texts.slice();const x=moved.splice(f,1)[0];moved.splice(to,0,x);
    let h='';moved.forEach((t,i)=>{h+=i===to?'</div>'+(m==="move"?'<div class="pfocus">'+plRow(i+1,t,o,false,' vadd')+'<button type="button" class="btn pri block" data-act="'+o.act+'" data-v="move-go">Propose moving #'+st.n+' to #'+st.to+'</button><button type="button" class="tlink small" data-act="'+o.act+'" data-v="cancel">Cancel</button></div>':plLocked(i+1,t,false,o,st.done))+'<div class="blurred" aria-hidden="true">':plRow(i+1,t,o,false)});
    return '<div class="card wc plbox"><div class="plist compact"><div class="blurred" aria-hidden="true">'+h+empties(len+1,cap-len)+'</div></div></div>'}
  if(m&&st.n&&m!=="done"&&!texts[st.n-1]){st.mode=null;st.n=null;m=null} // the slot emptied meanwhile (another vote passed)
  if(m&&st.n){const n=st.n;const t=texts[n-1];let focus;
    if(m==="menu")focus='<div class="pfocus"><div class="prow cta"><span class="pn">'+n+'</span><span class="pt">'+esc(t)+'</span></div><div class="pmenu"><button type="button" class="btn" data-act="'+o.act+'" data-v="menu-reword">✎ Reword</button><button type="button" class="btn" data-act="'+o.act+'" data-v="menu-remove">✕ Remove</button></div>'+(st.note?'<p class="small tutnote">'+esc(st.note)+'</p>':'')+'<button type="button" class="tlink small" data-act="'+o.act+'" data-v="cancel">Cancel</button></div>';
    else if(m==="reword")focus=plEditor(n,st.val!=null?st.val:t,"reword-go","Put the new wording to a vote",o,t);
    else if(m==="remove")focus='<div class="pfocus"><div class="prow vdel"><span class="pn">'+n+'</span><span class="pt"><s>'+esc(t)+'</s></span><span class="vtag">Remove</span></div><button type="button" class="btn pri block" data-act="'+o.act+'" data-v="remove-go">Put removal to a vote</button><button type="button" class="tlink small" data-act="'+o.act+'" data-v="cancel">Cancel</button></div>';
    else if(m==="done")focus=plLocked(n,st.done.kind==="remove"?t:st.done.text,st.done.kind==="remove",o,st.done);
    return '<div class="card wc plbox"><div class="plist compact">'+blur(rowsRange(0,n-1))+focus+blur(rowsRange(n,len)+empties(len+1,cap-len))+'</div></div>'}
  // plain list: read mode, or amend mode with insert spots, row tools and drag
  const amend=!!o.canEdit;const canAdd=(amend||(o.tapFirst&&!len))&&len<cap;o=Object.assign({},o,{len});
  let h='<div class="card wc plbox"><div class="plist compact'+(amend?' amending':' readmode')+(o.only?' showtools':'')+'" data-ns="'+o.act+'">'+(st.note?'<p class="small tutnote">'+esc(st.note)+'</p>':'');
  texts.forEach((t,i)=>{if(canAdd&&len>=2)h+=plIns(i+1,o);h+=plRow(i+1,t,o,amend)});
  for(let k=len+1;k<=cap;k++)h+=plEmpty(k,o,canAdd&&k===len+1);
  return h+'</div></div>'}
function plEditor(n,val,goAct,label,o,orig){return '<div class="pfocus"><div class="prow cta editrow first1"><span class="pn">'+n+'</span><textarea class="inp" id="pl-in" rows="1" maxlength="'+LIM.principle+'" data-orig="'+esc(orig||"")+'" placeholder="Write the principle" aria-label="Principle #'+n+'">'+esc(val)+'</textarea>'+'<span class="cleft"'+(String(val).length<LIM.principle-15?' hidden':'')+'>'+String(val).length+'/'+LIM.principle+'</span>'+'</div>'+
  '<button type="button" class="btn pri block" data-act="'+o.act+'" data-v="'+goAct+'" id="pl-go" '+(val.trim()&&val.trim()!==(orig||"").trim()?'':'disabled')+'>'+label+'</button><button type="button" class="tlink small" data-act="'+o.act+'" data-v="cancel">Cancel</button></div>'}
function plLocked(n,text,strike,o,d){return '<div class="pfocus"><div class="prow '+(strike?'vdel':'done1')+'"><span class="pn">'+n+'</span>'+(strike?'<span class="pt"><s>'+esc(text)+'</s></span><span class="vtag">Remove</span>':'<span class="pt">'+esc(text)+'</span>')+'</div>'+plReceipt(d,o)+'</div>'}
// shared state transitions; returns {submit:{kind,n|at,text}} when a proposal is made
function plAct(st,v,el,items,o){const inp=document.getElementById("pl-in");st.note=null;
  switch(v){
    case"gap":st.mode="add";st.at=+el.dataset.id;st.val=null;return{focus:true};
    case"row":{const it=items[+el.dataset.id-1];if(it&&it.id&&o.viewAct)go({type:"item",id:it.id});return{}}
    case"edit":if(o.only==="move"){st.note="Let's move one this time. Drag the ⠿.";return{}}if(o.only==="remove"){st.note="Let's remove one this time. Use ✕.";return{}}if(!items[+el.dataset.id-1])return{};st.mode="reword";st.n=+el.dataset.id;st.val=null;return{focus:true};
    case"del":if(o.only==="move"){st.note="Let's move one this time. Drag the ⠿.";return{}}if(o.only==="reword"){st.note="Let's reword one first. Use ✎. You'll remove one next.";return{}}if(!items[+el.dataset.id-1])return{};st.mode="remove";st.n=+el.dataset.id;return{};
    case"cancel":st.mode=null;st.n=null;st.at=null;st.to=null;st.val=null;return{};
    case"add-go":{const t=inp?norm(inp.value):"";if(!t)return{};return{submit:{kind:"add",at:st.at,text:t}}}
    case"reword-go":{const t=inp?norm(inp.value):"";if(!t||t===norm(items[st.n-1].text))return{};return{submit:{kind:"reword",n:st.n,text:t}}}
    case"remove-go":return{submit:{kind:"remove",n:st.n,text:items[st.n-1].text}};
    case"move-go":return{submit:{kind:"move",n:st.n,to:st.to,text:items[st.n-1].text}};
  }return{}}
function plDone(st,sub,fpSeed){st.mode="done";if(sub.at)st.at=sub.at;if(sub.n)st.n=sub.n;if(sub.to)st.to=sub.to;st.done={kind:sub.kind,text:sub.text,ts:now(),fp:receipt(S.me||"me",fpSeed,sub.kind,now()).slice(0,32),what:{add:"Principle proposed",reword:"New wording proposed",remove:"Removal proposed",move:"Move proposed"}[sub.kind]}}
function plFocus(){setTimeout(()=>{const i=document.getElementById("pl-in");if(!i)return;const f=i.closest(".pfocus");if(f)f.scrollIntoView({block:"center",behavior:reducedMotion()?"auto":"smooth"});if(!isTouch()){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},0)}
// drag ⠿ to move (amend mode)
function setupPins(){if(isTouch())return;document.querySelectorAll(".plist.amending").forEach(list=>{if(list._pins)return;list._pins=1;let tOpen=null,tClose=null,want=null;
  const pinOf=pos=>list.querySelector('.pins[data-id="'+pos+'"]');const cur=()=>list.querySelector(".pins.open");
  const set=pos=>{const c=cur();if(c&&+c.dataset.id===pos)return;list.querySelectorAll(".pins.open").forEach(x=>x.classList.remove("open"));const p=pos&&pinOf(pos);if(p)p.classList.add("open")};
  const target=(y)=>{const c=cur();
    if(c){const r=c.getBoundingClientRect();if(y>=r.top-4&&y<=r.bottom+4)return +c.dataset.id}
    const rows=[...list.querySelectorAll(".prow.amend[data-n]")];let hit=null,inRow=null;
    for(const row of rows){const r=row.getBoundingClientRect();const n=+row.dataset.n;const z=Math.max(6,r.height*0.4);
      if(y>=r.top-8&&y<r.top+z){hit=pinOf(n)?n:null;break}if(y>r.bottom-z&&y<=r.bottom+8){hit=pinOf(n+1)?n+1:null;break}
      if(y>=r.top&&y<=r.bottom){inRow=n;break}}
    if(hit==null&&rows.length&&y<rows[0].getBoundingClientRect().top)hit=pinOf(1)?1:null;
    if(hit!=null)return hit;
    // stay open while the pointer is on either row next to the open slot, so nothing jumps under it
    if(c&&inRow!=null){const k=+c.dataset.id;if(inRow===k||inRow===k-1)return k}
    return null};
  const go=pos=>{if(pos===want)return;want=pos;clearTimeout(tOpen);clearTimeout(tClose);
    if(pos==null)tClose=setTimeout(()=>set(null),140);else if(cur())set(pos);else tOpen=setTimeout(()=>set(pos),60)};
  const zone=list.closest(".plbox")||list;
  zone.addEventListener("mousemove",e=>{if(e.target.closest(".ptools"))return go(null);go(target(e.clientY))});
  zone.addEventListener("mouseleave",()=>go(null))})}
function setupPlDrag(){setupPins();
  document.querySelectorAll(".plist.amending [data-grip]").forEach(g=>{
    g.addEventListener("pointerdown",e=>{e.preventDefault();const list=g.closest(".plist");const row=g.closest(".prow");const from=+g.dataset.grip;
      const rows=[...list.querySelectorAll(".prow[data-n]")];const f=rows.indexOf(row);const rects=rows.map(r=>r.getBoundingClientRect());const sy0=window.scrollY;const y0=e.clientY;let t=f;
      const h=rects[f].height+4;row.classList.add("dragging");rows.forEach(r=>{if(r!==row)r.classList.add("shifting")});g.setPointerCapture(e.pointerId);
      const move=ev=>{const ds=window.scrollY-sy0;const dy=ev.clientY-y0+ds;row.style.transform="translateY("+dy+"px)";
        const c=rects[f].top+rects[f].height/2+dy;t=f;
        for(let i=f+1;i<rows.length;i++)if(c>rects[i].top+rects[i].height/2)t=i;
        for(let i=f-1;i>=0;i--)if(c<rects[i].top+rects[i].height/2)t=i;
        rows.forEach((r,i)=>{if(i===f)return;let off=0;if(t>f&&i>f&&i<=t)off=-h;else if(t<f&&i>=t&&i<f)off=h;r.style.transform=off?"translateY("+off+"px)":""})};
      const up=()=>{g.removeEventListener("pointermove",move);g.removeEventListener("pointerup",up);g.removeEventListener("pointercancel",up);
        rows.forEach(r=>{r.classList.remove("shifting","dragging");r.style.transform=""});
        if(t===f)return;const ns=list.dataset.ns;const st=ns==="pe"?(S.ui.pe||(S.ui.pe={})):tx();st.mode="move";st.n=from;st.to=t+1;render()};
      g.addEventListener("pointermove",move);g.addEventListener("pointerup",up);g.addEventListener("pointercancel",up)})})}

// --- tour helpers ---
function prow(n,t,o){o=o||{};return '<div class="prow'+(o.tap?' tap':'')+'"'+(o.tap?' role="button" tabindex="0" data-act="tx" data-v="row" data-id="'+n+'"':'')+'><span class="pn">'+n+'</span><span class="pt">'+esc(t)+'</span></div>'}
function pgap(pos){return '<button type="button" class="pgap" data-act="tx" data-v="gap" data-id="'+pos+'" aria-label="Propose a principle at #'+pos+'"><i></i><b>＋</b></button>'}
function prcpt(what){const fp=receipt(S.me||"me","tour-"+what,"p",S.ui.ts);return '<div class="prcpt" role="status"><div class="rh">✓ '+what+'</div><span class="small muted">Proposal receipt · '+tstamp(new Date(),true)+'</span><span class="code muted">'+fp.slice(0,32)+'</span><p>It\'s now on the votes page. The list only changes if it passes.</p></div>'}
// items: list; o.gaps, o.tap, o.focus:{at, html, shift}
function plistT(items,o){o=o||{};
  if(o.focus){const f=o.focus;const before=items.slice(0,f.at-1).map((t,i)=>prow(i+1,t)).join("");
    const after=items.slice(f.at-1+(f.replace?1:0)).map((t,i)=>prow(f.at+i+(f.replace?1:0)+(f.shift?1:0),t)).join("");
    return '<div class="plist">'+(before?'<div class="blurred" aria-hidden="true">'+before+'</div>':'')+f.html+(after?'<div class="blurred" aria-hidden="true">'+after+'</div>':'')+'</div>'}
  let h='<div class="plist'+(o.gaps?' gapped':'')+'">';
  items.forEach((t,i)=>{if(o.gaps)h+=pgap(i+1);h+=prow(i+1,t,{tap:o.tap})});
  if(o.gaps&&items.length<10)h+=pgap(items.length+1);
  return h+'</div>'}
function ed(n,val,id,btn,label,cancel){return '<div class="pfocus"><div class="prow cta editrow"><span class="pn">'+n+'</span><textarea class="inp" id="tx-in" rows="3" aria-label="'+label+'">'+esc(val)+'</textarea></div>'+
  '<button type="button" class="btn pri block" data-act="tx" data-v="'+id+'" id="tx-go" '+(btn?'':'disabled')+'>'+label+'</button>'+(cancel?'<button type="button" class="tlink small" data-act="tx" data-v="cancel">Cancel</button>':'')+'</div>'}
function lockedRow(n,val,what,strike){return '<div class="pfocus"><div class="prow editrow"><span class="pn">'+n+'</span>'+(strike?'<span class="pt"><s>'+esc(val)+'</s></span>':'<textarea class="inp" rows="2" readonly disabled>'+esc(val)+'</textarea>')+'</div>'+prcpt(what)+'</div>'}
function tapWord(){return isTouch()?'tap':'click'}
const T_FULL=(()=>{const l=T_PRIN.slice();l.splice(2,0,T_INSERT);l.push(T_TENTH);return l})();
const PLAIN_VOTES="Here's every vote, listed under private codes, with the time it was cast. Tap any vote to see its receipt.";
// a vote's receipt: it matches every copy that members keep (n = how many copies it was checked against)
function rcptHtml(mine,code,v,t,n){return '<div class="rcpt2"><b class="rok">✓ '+(mine?'Your vote matches every copy':'This vote matches every copy')+'</b><span>'+(mine?'Your code':'Code')+': '+esc(code)+' · '+(mine?'Your vote':'Vote')+': '+esc(v)+(t?' · Cast: '+fdt(t):'')+'</span><span class="muted">Checked against '+n+' '+(n===1?'copy':'copies')+' kept by members.</span></div>'}
const TOUR=[
  // pick the practice grid, then see its grid page
  {tip:()=>{const st=tx();if(st.picked)return 'This is what a grid page looks like. Its members propose and vote on everything together.';if(st.note)return esc(st.note);
     return st.sel?'That\'s the <b>'+esc(gridName(PRAC_CELL))+'</b>. Tap <b>Continue</b>.':'For this practice run, '+tapWord()+' the <b>'+esc(gridName(PRAC_CELL))+'</b>, our busiest grid.'},
   render:()=>{const st=tx();
    if(st.picked)return '<div class="tgrid pgrid">'+pracHead(0)+'</div>';
    return '<div class="pickmap">'+pracMap("tour-grid",!!st.sel)+'</div><p class="muted small mapnote">Numbers show members in each grid.</p>'},
   foot:()=>{const st=tx();return st.picked?null:st.sel?'<button type="button" class="btn pri block" data-act="tx" data-v="grid-go">Continue</button>':''},
   back:st=>{if(st.picked){st.picked=false;return true}if(st.sel){st.sel=false;return true}return false},backState:{picked:true,sel:true},
   ok:()=>!!tx().picked,btn:"Next: Your first principle"},
  // add the first principle: tap the empty slot → reword the example → proposed
  {tip:()=>{const st=tx();const T=isTouch()?'Tap':'Click';
     return st.phase==="proposed"?'Next, let\'s go vote on it. '+T+' <b>View its vote</b> under your principle.':st.phase==="typing"?'We\'ve filled in an example to get you started. Reword it if you like, then '+T.toLowerCase()+' <b>Propose this principle</b>.':'<b>Principles</b> are what your grid stands for. Members propose them and vote on them. Let\'s pretend the '+esc(gridName(PRAC_CELL))+' has none yet. '+T+' the first empty slot.'},
   render:()=>{const st=tx();const T=isTouch()?'tap':'click';const val=st.typed!=null?st.typed:T_FIRST;
    const row=st.phase==="proposed"?'<div class="prow first1 done1"><span class="pn">1</span><span class="pt">'+esc(tFirst())+'</span></div>':
      st.phase==="typing"?'<div class="prow cta editrow first1"><span class="pn">1</span><textarea class="inp" id="tx-in" rows="1" maxlength="'+LIM.principle+'" aria-label="Principle #1" autocomplete="off">'+esc(val)+'</textarea>'+'<span class="cleft"'+(String(val).length<LIM.principle-15?' hidden':'')+'>'+String(val).length+'/'+LIM.principle+'</span>'+'</div>':
      '<div class="prow pempty tap first first1 cue" role="button" tabindex="0" data-act="tx" data-v="slot"><span class="pn">1</span><span class="pt">Empty · '+T+' to propose one here</span></div>';
    const under=st.phase==="proposed"?'<div class="prcpt1" role="status"><span>✓ Proposed · '+new Date().toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})+' · <button type="button" class="tlink small plain cue" data-act="tx" data-v="tovotes">View its vote ›</button></span></div>':'';
    return gridMock('<div class="secthd prinhd"><span class="muted small">'+(st.phase==="proposed"?1:0)+' of 10</span></div><div class="card wc plbox"><div class="plist compact">'+row+under+'<div'+(st.phase?' class="blurred" aria-hidden="true"':' class="pl-rest"')+'>'+[2,3,4,5,6,7,8,9,10].map(n=>'<div class="prow pempty"><span class="pn">'+n+'</span><span class="pt">Empty</span></div>').join("")+'</div></div></div>',0)},
   back:st=>{if(st.phase==="proposed"){st.phase="typing";return true}if(st.phase==="typing"){st.phase=null;return true}return false},
   backState:{phase:"proposed",typed:T_FIRST},
   foot:()=>{const st=tx();if(st.phase==="typing")return norm(st.typed!=null?st.typed:T_FIRST)?'<button type="button" class="btn pri block" data-act="tx" data-v="first-go" id="tx-go">Propose this principle</button>':'';return ''},
   ok:()=>false,btn:""},
  // the vote: cast yours, watch the grid vote, see the result
  {tip:()=>{const st=tx();if(!st.voted)return 'You get a vote too, and it counts like everyone else\'s.';
     if(!st.simDone)return 'Your vote is in. Now the rest of the grid votes. Tap <b>Speed up</b> to watch.';
     return (st.voted==="n"?'Even without your vote, your principle passed.':'Your principle passed.')+' Now let\'s see every vote. Tap <b>'+(V1.yes+V1.no).toLocaleString()+' of '+V1.members.toLocaleString()+' voted</b>.'},
   render:()=>{const st=tx();const pick=S.ui.pick&&S.ui.pick.id==="tut"?S.ui.pick.v:null;
    return simChip("Add")+simCard(Object.assign({link:true},V1),tFirst(),st,st.voted)+(!st.voted?yesNo(pick,"tut-pick",""):'')+(st.simDone?v1Details(st):'')},
   foot:()=>!tx().voted||tx().simDone?'':speedBtn(),sim:V1,backState:{simDone:true,voted:"y"},ok:()=>false,btn:""},
  // every vote, under private codes; tap yours for its receipt
  {tip:()=>tx().mine?'Members keep copies of every vote. If anyone ever changed yours, this receipt would show it.':'That\'s your vote at the top. '+(isTouch()?'Tap':'Click')+' it to see your receipt.',
   render:()=>{const st=tx();const tot=V1.yes+V1.no;const others=tot-1;const PG=12;const pages=Math.ceil(others/PG);const pg=Math.min(st.page||0,pages-1);const rows=ledgerRows(V1,70,pg*PG,pg*PG+PG);
    const my=S.ui.tourVote||"y";const me={code:S.me?voterCode(S.me):"V-YOU000",t:new Date(Date.now()-71.5*3600e3),v:my};
    const yn=v=>v==="y"?"Yes":"No";
    const row=(r,mine)=>'<details class="lrow'+(mine?' me':'')+'"'+(mine&&st.mineOpen?' open':'')+'><summary class="row'+(mine&&!st.mine?' cue':'')+'"'+(mine?' data-act="tx" data-v="myrcpt"':'')+'><span class="code">'+r.code+(mine?' (you)':'')+'</span><span class="when">'+tstamp(r.t,true)+'</span><span class="vv" style="color:var(--'+(r.v==="y"?'yes':'no')+')">'+yn(r.v)+'</span></summary>'+rcptHtml(mine,r.code,yn(r.v),r.t,12)+'</details>';
    return '<div class="eyebrow">Votes cast</div><h1 class="casth">'+esc(tFirst())+'</h1><p class="muted" style="margin:0">'+PLAIN_VOTES+'</p>'+
    '<div class="card ledger"><div class="row lhead"><span>Voter</span><span>When</span><span>Vote</span></div>'+row(me,true)+rows.map(r=>row(r,false)).join("")+pagerHtml(pg,pages)+'</div>'},
   ok:()=>!!tx().mine,btn:"Next: Adding a principle"},
  // insert at a spot: on the Grid page, after tapping Amend
  {sec:true,pl:{items:()=>T_PRIN.map(t=>({text:t})),o:{act:"tx",doneMsg:TOUR_DONE,rows:false,addVal:T_INSERT}},
   tip:()=>{const st=tx();const m=st.mode;return m==="done"?'Here\'s what you proposed for spot '+st.at+'. Tap <b>View its vote</b>.':m==="add"?'Your new principle for spot '+st.at+'. Change the wording if you like, then propose it.':!st.amend?'Fast forward: your grid now has 8 principles. To propose a change, '+tapWord()+' <b>Amend</b>.':(isTouch()?'To propose a principle at a particular spot, tap the ＋ there. The others move down.':'To propose a principle at a particular spot, hover between two principles and click. The others move down.')},
   render:()=>{const st=tx();const sc=TOUR[S.ui.ts];const m=st.mode;const items=sc.pl.items();
    const hd=m?'':'<div class="secthd prinhd"><span class="muted small">'+items.length+' of 10</span><span class="prinact"><span class="tlink small plain" style="opacity:.5">History</span><button type="button" class="tlink small plain'+(st.amend?'':' cue')+'" data-act="tx" data-v="amend">'+(st.amend?'Done amending':'Amend')+'</button>'+'</span></div>';
    return gridMock(hd+plList(items,st,Object.assign({},sc.pl.o,{canEdit:!!st.amend})),items.length)},
   back:st=>{if(plBack(st))return true;if(st.amend){st.amend=false;return true}return false},backState:{amend:true},ok:()=>tx().view==="ballot"&&!!tx().voted,btn:"Next: Rewording a principle"},
  // reword
  {sec:true,pl:{items:()=>T_FULL.map(t=>({text:t})),o:{act:"tx",doneMsg:TOUR_DONE,canEdit:true,only:"reword"}},
   tip:()=>{const st=tx();const m=st.mode;return m==="done"?'Here\'s your new wording for #'+st.n+'. Tap <b>View its vote</b>.':m==="reword"?'Change the wording of #'+st.n+', then put it to a vote.':st.note?esc(st.note):'Fast forward again: the list is now full. A grid can have at most ten principles. To change one, use the <b>✎</b> next to it.'},
   render:()=>{const st=tx();const sc=TOUR[S.ui.ts];const m=st.mode;
    return gridMock((m?'':'<div class="secthd prinhd"><span class="muted small">10 of 10</span><span class="prinact"><span class="tlink small plain">Done amending</span></span></div>')+plList(sc.pl.items(),Object.assign({},st,{note:null}),sc.pl.o),10)},
   back:plBack,ok:()=>tx().view==="ballot"&&!!tx().voted,btn:"Next: Removing a principle"},
  // remove
  {sec:true,pl:{items:()=>T_FULL.map(t=>({text:t})),o:{act:"tx",doneMsg:TOUR_DONE,canEdit:true,only:"remove"}},
   tip:()=>{const st=tx();const m=st.mode;return m==="done"?'Here\'s what you proposed. Tap <b>View its vote</b>.':m==="remove"?'Propose removing #'+st.n+'?':st.note?esc(st.note):'Now say you want to remove a bad principle. Use the <b>✕</b> next to it.'},
   render:()=>{const st=tx();const sc=TOUR[S.ui.ts];const m=st.mode;
    return gridMock((m?'':'<div class="secthd prinhd"><span class="muted small">10 of 10</span><span class="prinact"><span class="tlink small plain">Done amending</span></span></div>')+plList(sc.pl.items(),Object.assign({},st,{note:null}),sc.pl.o),10)},
   back:plBack,ok:()=>tx().view==="ballot"&&!!tx().voted,btn:"Next: Moving a principle",keep:"removed"},
  // move
  {sec:true,keep:"removed",pl:{items:()=>T_FULL.map(t=>({text:t})),o:{act:"tx",doneMsg:TOUR_DONE,canEdit:true,move:true,only:"move"}},
   tip:()=>{const st=tx();const m=st.mode;return m==="done"?'Here\'s the move you proposed. Tap <b>View its vote</b>.':m==="move"?'Propose moving #'+st.n+' to #'+st.to+'?':st.note?esc(st.note):'Principles are listed in order of importance. To move one, drag the <b>⠿</b> next to it up or down.'},
   render:()=>{const st=tx();const sc=TOUR[S.ui.ts];const m=st.mode;
    return gridMock((m?'':'<div class="secthd prinhd"><span class="muted small">10 of 10</span><span class="prinact"><span class="tlink small plain">Done amending</span></span></div>')+plList(sc.pl.items(),Object.assign({},st,{note:null}),sc.pl.o),10)},
   back:plBack,ok:()=>tx().view==="ballot"&&!!tx().voted,btn:"Next: History"},
  // history: start on the Grid page, tap History, step back, then See the vote
  {tip:()=>{const st=tx();if(!st.h)return 'Every change that passes makes a new version of the list. To look back, '+tapWord()+' <b>History</b>.';
     if(st.h==="vote")return 'Every past vote keeps a record like this, including how <b>you</b> voted. Only you can see your own vote.';
     if(!st.older)return 'Here\'s every version of the list, newest first. Tap <b>Older</b>'+(isTouch()?', or swipe the list,':'')+' to step back in time.';
     return 'Each version shows the whole list, with what changed marked in green and red. Tap <b>See the vote</b> to see how it went.'},
   render:()=>{const st=tx();const vs=tourVersions();const k=st.k==null?vs.length-1:st.k;const cur=vs[vs.length-1].list;
    if(!st.h)return gridMock('<div class="secthd prinhd"><span class="muted small">'+cur.length+' of 10</span><span class="prinact"><button type="button" class="tlink small plain cue" data-act="tx" data-v="hist">History</button><span class="tlink small plain" style="opacity:.5">Amend</span></span></div><div class="card wc plbox"><div class="plist compact readmode">'+cur.map((x,i)=>'<div class="prow"><span class="pn">'+(i+1)+'</span><span class="pt">'+esc(x.text)+'</span></div>').join("")+'</div></div>',cur.length);
    if(st.h==="vote"){const v=vs[k];const tot=v.y+v.n;const my=S.ui.tourVote||"y";
      const ptx=(v.type==="remove"||v.type==="move")?v.old.text:v.list[v.i].text;const cf={yes:v.y,no:v.n,members:16520,ky:2.6,kn:3.4};
      return chipHead({add:"Add",reword:"Replace",remove:"Delete",move:"Move"}[v.type],gridName(PRAC_CELL))+
      vcard({chip:'<span class="chip yes">Passed</span>',left:'Closed '+fshort(v.at),text:ptx,mine:my,mid:'<div class="vc1-res">'+simChart(cf,simSeries(cf).length-1)+ynLine(v.y,v.n,true)+'</div>',foot:'<span class="muted small">'+tot.toLocaleString()+' of 16,520 voted</span>'})+
      detailCard([['Proposed by','Maya Douglas'],['Proposed',fdt(v.at-72*3600e3)],['Voting closed',fdt(v.at)],['Supporters','<span class="kvy">✓ 826 reached</span>'],['Minimum of 5 votes','<span class="kvy">✓ Met</span>'],['Your vote',my==="y"?'<span class="kvy">Yes</span>':'<span class="kvn">No</span>']])}
    const what=v=>v.type==="add"?(v.i<v.list.length-1?'Inserted at #'+(v.i+1):'Added as #'+(v.i+1)):v.type==="reword"?'Replaced #'+(v.i+1):v.type==="remove"?'Removed #'+(v.i+1):'Moved #'+(v.from+1)+' → #'+(v.i+1);
    return '<div><h1>Principles: history</h1></div>'+seg("tx-none",[["versions","Versions"],["votes","All votes"]],"versions")+
      verBlock(vs,k,{act:"tx",prefix:"v",ns:"tour",hint:!st.older,head:(v,kk)=>gridListHead(PRAC_CELL,v.list.length+' of 10 · '+(kk===vs.length-1?'Current':fshort(v.at))),meta:v=>'<span class="muted small">'+what(v)+' · passed '+v.y.toLocaleString()+'–'+v.n.toLocaleString()+'</span><button type="button" class="tlink small'+(st.older&&!st.seen?' cue':'')+'" data-act="tx" data-v="hvote">See the vote ›</button>'})},
   back:st=>{if(st.h==="vote"){st.h=true;return true}if(st.h){st.h=false;return true}return false},
   ok:()=>!!tx().seen,btn:"Next: Find your grid"},
  // set your real grid from a typed address
  {tip:()=>myMember()?'That\'s the tour. You\'re all set.':'That\'s the tour. Now let\'s find your real grid. Type your address, or just your town or neighborhood. Your phone finds the grid by itself. You can move later, but each move means 72 hours without proposing or voting.',
   render:()=>myMember()?'<div class="tgrid">'+realHead(myCell())+'</div>':findGrid(true),
   foot:()=>myMember()?null:addrGo(),
   ok:()=>!!myMember(),btn:"Go to my grid",last:true}
];
const VB={members:16520,min:826,yes:3140,no:2260,ky:2.4,kn:6};
function tourVoteView(sc){const st=tx(),d=st.done;const texts=sc.pl.items().map(x=>x.text);
  const c={kind:d.kind,text:d.text,at:st.at,n:st.n,to:st.to};const v=changeV(texts,c);
  const shown={add:d.text,reword:d.text,remove:texts[st.n-1],move:texts[st.n-1]}[d.kind];const aw={add:"Add",reword:"Replace",remove:"Delete",move:"Move"}[d.kind];
  if(st.view==="ballot"){const pick=S.ui.pick&&S.ui.pick.id==="tut"?S.ui.pick.v:null;const N=simSeries(VB).length-1,k=Math.round(N*0.4),c0=simSeries(VB)[k];const cur=[c0[0]+(st.voted==="y"?1:0),c0[1]+(st.voted==="n"?1:0)];
    const card=vcard({left:left(43*36e5),pre:d.kind==="reword"?'<p class="cardmeta" style="margin:0">Replaces: '+esc(texts[st.n-1])+'</p>':'',text:shown,mine:st.voted,pop:st.voted&&S.ui.justVoted==="tut",
      foot:'<span class="muted small">'+(cur[0]+cur[1]).toLocaleString()+' of '+VB.members.toLocaleString()+' voted</span>'})+
      '<div class="card results"><p class="gofull">✓ Going to a full vote · 51% needed to pass</p>'+simChart(VB,k)+ynLine(cur[0],cur[1],false)+'</div>';
    const det=detailCard([['Proposed by','You'],['Proposed',tstamp(new Date(d.ts||Date.now()),true)],['Voting closes','In 2 days'],['Supporters','<span class="kvy">✓ Reached</span>'],['Your vote',st.voted==="y"?'<span class="kvy">Yes</span>':st.voted==="n"?'<span class="kvn">No</span>':'<span class="muted">Not yet</span>']]);
    return chipHead(aw,gridName(PRAC_CELL))+card+(st.voted?det:yesNo(pick,"tut-pick",""))}
  return '<div>'+chipHead(aw,gridName(PRAC_CELL))+'<h1 style="margin:0">Proposed change</h1></div><p class="lede" style="margin:0">Here is what the grid\'s principles would look like if this passes.</p>'+
    '<div class="card wc plbox">'+gridListHead(PRAC_CELL,texts.length+' of 10 principles now')+'<div class="plist compact">'+verRows(v)+'</div></div>'+
    '<button type="button" class="btn pri block cue" data-act="tx" data-v="ballot">Cast your vote →</button>'}
function plVoteTip(sc){const st=tx(),d=st.done;const texts=sc.pl.items().map(x=>x.text);
  if(st.view==="ballot")return st.voted?'Nice. In a real vote, that would be final.':'Each proposal gets its own ballot. How do you vote?';
  const how={add:(st.at<=texts.length?'The new principle is shown in green, marked <b>Insert</b>.':'The new principle is shown in green, marked <b>Add</b>.'),reword:'The current wording is shown in red and the new wording in green, both marked <b>Replace</b>.',remove:'The principle is shown in red and crossed out, marked <b>Remove</b>.',move:'The principle is shown in red where it is now and in green where it would go.'}[d.kind];
  return 'Every proposal gets its own page, showing what it would do to the whole list. '+how+' Then tap <b>Cast your vote</b>.'}
function tourView(){
  const i=S.ui.ts;const sc=TOUR[i];const st=tx();const inVote=!!(sc.pl&&st.view);
  let foot=sc.foot?sc.foot():null;
  // no bottom button until the step's task is done: the pulsing link or slot is the only thing to tap
  if(foot==null&&sc.pl&&(inVote?!(st.view==="ballot"&&st.voted):!!st.mode))foot='';
  if(foot==null)foot=sc.ok()?'<button type="button" class="btn pri block" data-act="'+(sc.last?'intro-done':'tour-next')+'">'+(sc.btn||'Continue')+'</button>':'';
  return '<div class="tut tfill"><div class="tuthead">'+tnav(i+1,TOUR.length,true)+ttip(inVote?plVoteTip(sc):(sc.tip?sc.tip():''))+'</div><div class="tbody">'+(inVote?tourVoteView(sc):sc.render())+'</div><div class="tfoot" id="tfoot">'+foot+'</div></div>';
}
function tourGo(i,fromBack){const keep=tx().removed;S.ui.ts=i;S.ui.tx=fromBack&&TOUR[i]&&TOUR[i].backState?Object.assign({},TOUR[i].backState):{};if(keep&&TOUR[i]&&TOUR[i].keep)S.ui.tx.removed=keep;S.ui.pick=null;render();window.scrollTo(0,0);if(TOUR[i]&&TOUR[i].sec)tourToSec()}
// scroll the featured section up to just under the tour tip, so nothing peeks out between them
function tourToSec(){const sec=document.getElementById("tsec"),th=document.querySelector(".tuthead"),hd=document.querySelector(".hdr");if(!sec||!th)return;
  const y=sec.getBoundingClientRect().top+window.scrollY-th.offsetHeight-(hd?hd.offsetHeight:0)+8;const max=document.documentElement.scrollHeight-window.innerHeight;window.scrollTo(0,y<=max?Math.max(0,y):0)}
function tourBack(){const sc=TOUR[S.ui.ts];const st=tx();if(st.simming)return;if(sc.back&&sc.back(st)){S.ui.pick=null;render();window.scrollTo(0,0);return}tourGo(S.ui.ts-1,true)}
function tutPick(v){const st=tx();if(st.voted)return;if(S.ui.pick&&S.ui.pick.id==="tut"&&S.ui.pick.v===v){st.voted=v;st.votedAt=Date.now();S.ui.pick=null;if(TOUR[S.ui.ts]&&TOUR[S.ui.ts].sim===V1)S.ui.tourVote=v;render();window.scrollTo(0,0);return}else S.ui.pick={id:"tut",v};render()}
function plBack(st){if(st.view==="ballot"){st.view="vote";st.voted=null;return true}if(st.view){st.view=null;return true}if(st.mode==="done"){const d=st.done;st.mode=d.kind;st.val=(d.kind==="remove"||d.kind==="move")?null:d.text;st.done=null;if(d.kind==="remove")st.removed=null;return true}if(st.mode){st.mode=null;st.n=null;st.at=null;st.to=null;return true}return false}
const PLV=["gap","row","edit","del","cancel","add-go","reword-go","remove-go","move-go"];
function tourAct(v,el){const st=tx();const inp=document.getElementById("tx-in");
  if(/^v-?\d+$/.test(v)){const nk=+v.slice(1);const cur=st.k==null?tourVersions().length-1:st.k;verGo(nk,cur,()=>{if(nk<cur)st.older=true;st.k=nk});return}
  {const sc=TOUR[S.ui.ts];if(sc&&sc.pl&&PLV.includes(v)){const r=plAct(st,v,el,sc.pl.items(),sc.pl.o);if(r.submit){plDone(st,r.submit,"tour"+S.ui.ts);if(r.submit.kind==="remove")st.removed=r.submit.n}render();if(r.focus)plFocus();return}}
  switch(v){
    case"slot":st.phase="typing";render();return;
    case"grid-go":if(st.sel){st.picked=true;render();window.scrollTo(0,0)}return;
    case"use-ex":st.typed=T_FIRST;render();return;
    case"copy":{const c=document.getElementById("tx-copy");const okc=()=>{if(c)c.textContent="Copied ✓"};
      const fb=()=>{try{const t=document.createElement("textarea");t.value=T_FIRST;t.style.position="fixed";t.style.opacity="0";document.body.appendChild(t);t.select();const r=document.execCommand("copy");t.remove();if(r)okc();else if(c)c.textContent="Long-press the text to copy"}catch(e){if(c)c.textContent="Long-press the text to copy"}};
      try{navigator.clipboard.writeText(T_FIRST).then(okc,fb)}catch(e){fb()}return}
    case"first-go":if(inp&&norm(inp.value)){S.ui.tourFirst=norm(inp.value);tourVersions.c=null;st.phase="proposed";render()}return;
    case"gap":st.at=+el.dataset.id;render();setTimeout(()=>{const i=document.getElementById("tx-in");if(i&&!isTouch()){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},0);return;
    case"row":{const n=+el.dataset.id;const k=TOUR[S.ui.ts].rowAct;if(k==="edit")st.editing=n;else if(k==="delete")st.deleting=n;render();if(k==="edit")setTimeout(()=>{const i=document.getElementById("tx-in");if(i&&!isTouch()){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},0);return}
    case"cancel":st.at=null;st.editing=null;st.deleting=null;render();return;
    case"insert-go":if(inp&&inp.value.trim()){st.text=inp.value.trim();st.inserted=true;render()}return;
    case"edit":st.editing=+el.dataset.id;render();const i2=document.getElementById("tx-in");if(i2){i2.focus();i2.setSelectionRange(i2.value.length,i2.value.length)}return;
    case"edit-go":if(inp&&inp.value.trim()){st.edited=st.editing;st.editText=inp.value.trim();st.editing=null;render()}return;
    case"pg":st.page=Math.max(0,(st.page||0)+(+el.dataset.id));render();return;
    case"pgto":st.page=+el.dataset.id;render();return;
    case"del":st.deleting=+el.dataset.id;render();return;
    case"del-cancel":st.deleting=null;render();return;
    case"del-go":st.removed=st.deleting;st.deleting=null;render();return;
    case"sim":simRun(TOUR[S.ui.ts].sim);return;
    case"amend":st.amend=!st.amend;st.mode=null;render();return;
    case"hist":st.h=true;render();window.scrollTo(0,0);return;
    case"myrcpt":st.mine=true;st.mineOpen=!st.mineOpen;render();return;
    case"hist-back":st.h=false;render();window.scrollTo(0,0);return;
    case"hvote":st.h="vote";st.seen=true;render();window.scrollTo(0,0);return;
    case"tovote":st.view="vote";render();window.scrollTo(0,0);return;
    case"ballot":st.view="ballot";st.voted=null;S.ui.pick=null;render();window.scrollTo(0,0);return;
    case"tovotes":tourGo(S.ui.ts+1);return;
    case"more":st.shown=(st.shown||12)+50;render();return;
    case"breakdown":tourGo(S.ui.ts+1);return;
  }
}
function isTouch(){try{return matchMedia("(hover: none)").matches}catch(e){return false}}
function yesNo(pick,act,id){const d=id?' data-id="'+id+'"':'';const b=(v,ic,l)=>'<button type="button" class="ynb ynb-'+v+(pick===v?' on':'')+'" data-act="'+act+'"'+d+' data-v="'+v+'" aria-pressed="'+(pick===v)+'"><i aria-hidden="true">'+ic+'</i><span>'+l+'</span></button>';return '<div class="yn">'+b("n",IC.x,"No")+b("y",IC.check,"Yes")+'</div><p class="ynhint"'+(pick?'':' hidden')+'>Tap again to confirm</p>'}

// ---------- join ----------
let joinSel=null,joinFilter="";
function townButtons(act){const f=joinFilter.trim().toLowerCase();const towns=TOWNS.filter(t=>t[0].toLowerCase().includes(f));return towns.length?towns.map(t=>'<button type="button" data-act="'+act+'" data-v="'+esc(t[0])+'" class="'+(joinSel&&joinSel.town===t[0]?"on":"")+'"><span>'+esc(t[0])+'</span><span class="muted">'+esc(gridName(TOWN_CELL[t[0]]))+'</span></button>').join(""):'<div class="empty">No match. Pick the nearest town, or tap your grid on the map.</div>'}
// Places matching what's typed (2+ letters): names starting with it, then names with a word starting with it.
function placeHits(q,k){q=q.trim().toLowerCase();if(q.length<2)return[];const out=[],seen=new Set();
  const score=p=>p.low===q?0:p.low.startsWith(q)?1:(" "+p.low).includes(" "+q)?2:9;
  for(const p of places()){const sc=score(p);if(sc>2)continue;const key=p.low+"|"+p.cell;if(seen.has(key))continue;seen.add(key);out.push([sc,p])}
  out.sort((a,b)=>a[0]-b[0]||(a[1].cat===1?0:1)-(b[1].cat===1?0:1)||(cellCounts()[b[1].cell]||0)-(cellCounts()[a[1].cell]||0)||a[1].name.length-b[1].name.length||a[1].name.localeCompare(b[1].name));
  return out.slice(0,k||8).map(x=>x[1])}
function suggHtml(q,act){const h=placeHits(q);return h.length?'<div class="sugg" role="listbox">'+h.map(p=>'<button type="button" role="option" class="sg" data-act="'+act+'" data-v="'+p.cell+'" data-town="'+esc(p.name)+'"><span>'+esc(p.name)+'</span><span class="muted">'+esc(gridName(p.cell))+'</span></button>').join("")+'</div>':''}
// Find your grid from a typed home address: the town or neighborhood in it is matched on the device, against BC's
// place names. Nothing typed is sent anywhere, and only the grid (and its main town) is kept, never the address.
const ADDR={q:"",cell:null,town:"",err:""};let addrT=null,gpT=null;
function addrLocal(q){const t=" "+q.toLowerCase().replace(/[^a-z0-9' ]+/g," ").replace(/\s+/g," ")+" ";let best=null;
  for(const x of TOWNS){const n=x[0].replace(/ \(.*\)/,"").toLowerCase().replace(/[^a-z0-9' ]+/g," ");if(t.includes(" "+n+" ")&&(!best||n.length>best[1].length))best=[x[0],n,TOWN_CELL[x[0]]]}
  if(!best)for(const p of places()){const n=p.low.replace(/[^a-z0-9' ]+/g," ");if(n.length>3&&t.includes(" "+n+" ")&&(!best||n.length>best[1].length))best=[p.name,n,p.cell]}
  return best?{cell:best[2],town:best[0]}:null}
function addrSet(q,enter){ADDR.q=q;ADDR.err="";clearTimeout(addrT);const loc=addrLocal(q);
  if(loc){ADDR.cell=loc.cell;ADDR.town=loc.town;addrShow();return}
  ADDR.cell=null;ADDR.town="";addrShow();if(q.trim().length<2)return;
  // say we couldn't find it only once they stop typing (about a second) or press Enter
  const miss=()=>{if(ADDR.cell||ADDR.q!==q)return;ADDR.err=placeHits(q).length?"":"We couldn't find a BC town in that. Add your town or neighborhood, or pick one below.";addrShow()};
  if(enter)miss();else addrT=setTimeout(miss,1000)}
function addrPick(cell,town){ADDR.cell=cell;ADDR.town=town||townsIn(cell)[0]||"";ADDR.err="";addrShow()}
function addrResult(){if(ADDR.cell){const c=ADDR.cell;const n=cellCounts()[c]||0;
    return '<div class="card addrhit"><div class="ghead"><span class="minimap">'+bcMap(id=>id===c?{cls:"f-pick"}:null,{noMe:true})+'</span><div class="ghead-t"><span class="gname">'+esc(gridName(c))+'</span><p class="gsum">'+(townsLine(townsIn(c))||'')+'</p><span class="muted small">'+n.toLocaleString()+' member'+(n===1?'':'s')+'</span></div></div></div>'}
  const sg=suggHtml(ADDR.q.split(",").pop(),"addr-pick");if(sg)return sg+(ADDR.err?'<p class="small" style="margin:0;color:var(--warn)">'+esc(ADDR.err)+'</p>':'');
  if(ADDR.err)return '<p class="small" style="margin:0;color:var(--warn)">'+esc(ADDR.err)+'</p>';return ''}
function addrGo(){return ADDR.cell?'<button type="button" class="btn pri block" data-act="join">Join '+esc(gridName(ADDR.cell))+'</button>':''}
function addrShow(){const r=document.getElementById("addr-res");if(r)r.innerHTML=addrResult();const g=document.getElementById(S.ui.ts!=null?"tfoot":"addr-go");if(g)g.innerHTML=addrGo()}
// Setting or changing your grid starts a 72-hour wait with no proposing or voting (the user's call, Oct 28), so nobody
// shops around for proposals in other areas and moves in to vote on them. Waived during the beta.
function lockWarn(move){return '<div class="note warn lockwarn"><b>Warning:</b> '+(move?'moving to a new grid':'setting your grid')+' locks your account for 72 hours. You can still look around, but you can\'t propose or vote.'+(move?' Any lead role ends and any candidacy is withdrawn.':'')+' <button type="button" class="tlink" data-act="why-lock">Why?</button>'+(BETA_WAIVE?' <b>During the beta, this wait is waived.</b>':'')+'</div>'}
const WHY_LOCK='<p>So nobody can go looking for proposals they like in other areas, then move in just to vote on them.</p><p>In the final version, we plan to confirm where you live with an outside ID check, so your grid matches your home.</p>'+(BETA_WAIVE?'<p>During the beta, the wait is waived so you can try everything right away.</p>':'');
// Ignoring a member (the user's call, Oct 28): nobody is blocked or limited for proposing too much; each member can
// ignore whoever they like instead. An ignored member's proposals are hidden while they gather support; one that gets
// enough support goes to a full vote and shows again, since every member votes on it. Kept on this device only.
const IGN="citizens-ignored";
function ignored(){try{return JSON.parse(localStorage.getItem(IGN)||"{}")||{}}catch(e){return {}}}
function setIgnored(pk,on){const g=ignored();if(on)g[pk]=Date.now();else delete g[pk];try{localStorage.setItem(IGN,JSON.stringify(g))}catch(e){}C={}}
function isMuted(it){return !!(it&&it.by&&it.by!==S.me&&ignored()[it.by]&&it.kind==="principle"&&it.level!=="prov"&&!hasQ(it))}
const WHY_IGN='<p>Anyone can propose as many principles as they like. We don\'t block or limit members, because deciding who gets silenced is a power nobody should have.</p><p>Instead, you decide for yourself. If someone posts too much, ignore them: their proposals disappear from your lists while they gather support. If one gets enough support to go to a full vote, it shows up again, because every member votes on it.</p><p>Ignoring is private. It\'s saved only on this device, and nobody is told.</p>';
function findGrid(tour){return '<h1>Find your grid</h1><label class="f" for="addr-q">Your home address<input class="inp" id="addr-q" type="text" value="'+esc(ADDR.q)+'" placeholder="e.g. 123 Main St, Kamloops" autocomplete="street-address" enterkeyhint="search"></label>'+
  '<p class="muted small" style="margin:-6px 0 0">Your phone matches it to a grid by itself. It isn\'t sent anywhere or kept.</p>'+lockWarn(false)+'<div id="addr-res" class="stack">'+addrResult()+'</div>'+(tour?'':'<div id="addr-go">'+addrGo()+'</div>')}
function realHead(c){return '<div class="ghead"><span class="minimap">'+bcMap(id=>id===c?{cls:"f-pick"}:null,{noMe:true})+'</span><div class="ghead-t"><h1 class="gtitle"><span>'+esc(gridName(c))+'</span><small class="gmine">(your grid)</small></h1><p class="gsum">'+(townsLine(townsIn(c))||'')+'</p></div></div>'}
function joinView(){return findGrid(false)}

// ---------- status banner ----------
function statusBanner(){
  const e=me();if(e&&e.waivedNew)return '<button type="button" class="strip st-new" data-act="tab" data-v="me"><b>Welcome!</b> New members can\'t normally vote until '+fdt(e.waivedNew)+BETA_NOTE+'</button>';if(!e||!e.inBox)return "";
  if(e.why==="new")return '<button type="button" class="strip st-new" data-act="tab" data-v="me"><b>Welcome!</b> You can start voting '+dot(fdt(e.until))+'</button>';
  return '<button type="button" class="strip st-pen" data-act="tab" data-v="me"><b>In the penalty box until '+dot(fdt(e.until))+'</b> You missed a vote, so you can\'t vote or propose until then.</button>';
}
function urgentStrip(){
  const e=me();if(!e)return "";const soon=e.pending.filter(it=>it.closes-now()<24*3600e3);if(!soon.length)return "";
  const it=soon[0];return '<button type="button" class="strip st-urgent" data-act="open-item" data-v="'+it.id+'"><b>⚠ '+(soon.length===1?'A vote closes':soon.length+' votes close')+' in '+left(it.closes-now()).replace(" left","")+'.</b> Miss it and you go in the penalty box. Vote now →</button>';
}
// ---------- notices: one card at the top of the page, one notice at a time (swipe, "1/3"), each with Hide ----------
// kinds: info (teal: tour tips, good standing), beta (amber: what the beta waives), block (red: what stops you)
const NHID="citizens-hidden-notices";
function nHidden(){try{return JSON.parse(localStorage.getItem(NHID)||"{}")}catch(e){return{}}}
function hm(ms){const m=Math.max(1,Math.ceil(ms/6e4)),h=Math.floor(m/60);return h>=1?plural(h,"hour")+(m%60?" "+plural(m%60,"minute"):""):plural(m,"minute")}
// In a regular web browser (not the app, not Tor Browser) a host sees the voter's internet address: a red warning on
// every page's notices and on every ballot, which can't be hidden (the user's call, Oct 28).
function plainRoute(){return !!(S.voter&&!S.voter.native&&S.voter.route&&S.voter.route()==="plain")}
const PRIV_HTML='<b>For maximum secrecy, vote in the <a href="/download.html">Android app</a> or <a href="https://www.torproject.org/download/" target="_blank" rel="noopener">Tor Browser</a>.</b> In a regular browser, a member acting in bad faith could run a host and match internet addresses to votes.';
function noticeList(o){o=o||{};const out=[];const uid=o.member||S.me;const self=uid===S.me;const e=engine(uid);if(!e)return out;
  if(self&&!o.member&&plainRoute())out.push({id:"priv",sig:"1",kind:"block",keep:true,html:PRIV_HTML});
  if(self&&!o.member&&BETA_WAIVE)out.push({id:"trial",sig:"1",kind:"beta",html:'<b>We\'re still testing.</b> Votes during testing are for practice. They won\'t become party policy, and we may clear them before the official launch.'});
  if(self&&e.waivedNew&&e.waivedNew>now())out.push({id:"cool",sig:String(e.waivedNew),kind:"beta",html:(e.m.movedAt&&e.m.movedAt===e.m.joinedAt?'You moved grids, so':'As a new member,')+' you\'d normally wait another <b>'+hm(e.waivedNew-now())+'</b> before you can vote or propose. For the beta, that\'s waived, so you can start now. <button type="button" class="tlink" data-act="why-lock">Why?</button>'});
  if(e.inBox)out.push({id:"box",sig:e.why+e.until,kind:"block",html:self?(e.why==="new"?'<b>New member.</b> You can start voting and proposing '+dot(fdt(e.until))+'':'<b>In the penalty box until '+dot(fdt(e.until))+'</b> You missed a required vote, so you can\'t vote or propose until then.'):'<b>'+(e.why==="new"?'New member':'In the penalty box')+' until '+dot(fdt(e.until))+'</b> Can\'t vote, propose or run for a lead until then.'});
  if(self&&!o.member&&window.CPAccount&&window.CPAccount.online&&window.CPAccount.synced&&window.CPAccount.synced()&&!window.CPAccount.online())out.push({id:"off",sig:String(Math.floor(now()/36e5)),kind:"block",html:'<b>Can\'t reach the party\'s hosts.</b> What you do is saved on this phone and goes out once it reconnects.'});
  if(self&&!o.member){const soon=e.pending.filter(it=>it.closes-now()<24*3600e3);if(soon.length){const it=soon[0];out.push({id:"urg",sig:it.id,kind:"block",html:'<b>'+(soon.length===1?'A required vote closes':soon.length+' required votes close')+' in '+left(it.closes-now()).replace(/ left$/,'')+'.</b> Miss it and you go in the penalty box. <button type="button" class="tlink" data-act="open-item" data-v="'+it.id+'">Vote now</button>'})}}
  if(self&&o.grid&&o.grid===myCell()&&BETA_WAIVE&&gridSize(o.grid)<MIN_GRID)out.push({id:"g20",sig:o.grid,kind:"beta",html:'A grid normally needs '+MIN_GRID+' members before it can vote on its own principles (yours has '+gridSize(o.grid)+'). For the beta, that\'s waived.'});
  if(o.member&&!e.inBox)out.push({id:"good",sig:self?"me":"other",kind:"info",html:'<b>✓ Good standing.</b> '+(self?'You can':'Can')+' vote, propose and run for a lead.'});
  return out}
function noticeCard(list,key){const hid=nHidden();const vis=list.filter(n=>n.keep||hid[n.id]!==n.sig);if(!vis.length)return '';
  S.ui.nIdx=S.ui.nIdx||{};const i=Math.min(S.ui.nIdx[key]||0,vis.length-1);
  return '<div class="ncard" data-key="'+esc(key)+'"><div class="ncar" id="ncar">'+vis.map((n,k)=>'<div class="npanel n-'+n.kind+'" role="note"><div class="nbody">'+n.html+'</div>'+(n.keep?'':'<button type="button" class="nhide" data-act="nhide" data-v="'+n.id+'" data-id="'+esc(n.sig)+'">Hide</button>')+'</div>').join("")+'</div>'+
    (vis.length>1?'<div class="ndots"><button type="button" class="narr" data-act="nmove" data-v="-1" aria-label="Previous notice">‹</button><span class="npos">'+(i+1)+'/'+vis.length+'</span>'+vis.map((n,k)=>'<button type="button" class="ndot'+(k===i?' on':'')+'" data-act="nmove" data-v="='+k+'" aria-label="Notice '+(k+1)+'"><i></i></button>').join("")+'<button type="button" class="narr" data-act="nmove" data-v="1" aria-label="Next notice">›</button></div>':'')+'</div>'}
function fitTitle(){const t=document.querySelector("h1.gtitle>span");if(!t)return;let f=26;t.style.fontSize="";while(t.scrollWidth>t.parentElement.clientWidth+1&&f>16){f--;t.style.fontSize=f+"px"}}
function setupNotices(){const c=document.querySelector(".ncard");if(!c)return;const car=c.querySelector(".ncar");const key=c.dataset.key;const n=car.children.length;
  car.scrollLeft=Math.min(S.ui.nIdx[key]||0,n-1)*car.clientWidth;
  car.addEventListener("scroll",()=>{const i=Math.round(car.scrollLeft/Math.max(1,car.clientWidth));if(i===S.ui.nIdx[key])return;S.ui.nIdx[key]=i;const p=c.querySelector(".npos");if(p)p.textContent=(i+1)+"/"+n;c.querySelectorAll(".ndots .ndot").forEach((d,k)=>d.classList.toggle("on",k===i))},{passive:true})}
function blockedNote(){const e=me();if(e&&e.waivedNew)return '';return e&&e.inBox?'<div class="note warn">'+(e.why==="new"?"New members":"While in the penalty box, you")+' can\'t do this until '+dot(fdt(e.until))+'</div>':""}

// ---------- swipe carousels ----------
const CATS=[["all","All"],["principle","Principles"],["policy","Policies"],["plan","Plans"],["teams","Teams"],["leads","Leads"]];
function catOf(it){if(it.kind==="promote"){const s=S.items[it.src];return s?s.kind:"principle"}if(it.kind==="office")return (it.act==="election"||it.act==="recall")?"leads":"teams";return it.kind}
function carousel(name,tabs,panels){
  const idx=Math.min(S.ui.car[name]||0,tabs.length-1);
  return '<div class="pills" role="tablist" data-car="'+name+'">'+tabs.map((t,i)=>'<button type="button" role="tab" data-act="car" data-v="'+name+'" data-id="'+i+'" aria-pressed="'+(i===idx)+'">'+t+'</button>').join("")+'</div>'+
  '<div class="car" id="car-'+name+'" data-name="'+name+'">'+panels.map(p=>'<section class="panel">'+p+'</section>').join("")+'</div>';
}
function setupCarousels(){
  document.querySelectorAll(".car").forEach(car=>{
    const name=car.dataset.name;const idx=S.ui.car[name]||0;
    car.scrollLeft=idx*car.clientWidth;fitCar(car,idx);
    let tmr=null;
    car.addEventListener("scroll",()=>{const i=Math.round(car.scrollLeft/Math.max(1,car.clientWidth));if(i!==S.ui.car[name]){if(!car._prog&&!car._swiped){navMark();car._swiped=true}S.ui.car[name]=i;markPills(name,i);fitCar(car,i);carTop(car)}clearTimeout(car._st);car._st=setTimeout(()=>{car._swiped=false},300);clearTimeout(tmr);tmr=setTimeout(()=>fitCar(car,i),90)},{passive:true});
  });
}
function fitCar(car,i){const p=car.children[i];if(!p)return;const tb=document.getElementById("tabs");const pills=car.previousElementSibling;const hd=document.querySelector(".hdr");
  const room=window.innerHeight-(hd?hd.offsetHeight:0)-(pills?pills.offsetHeight:0)-(tb&&!tb.hidden?tb.offsetHeight:0)-8;car.style.height=Math.max(p.offsetHeight,room)+"px"}
// switching tabs while scrolled down: the new tab starts at its own top, just under the sticky tab bar
function carTop(car){const pills=car.previousElementSibling;if(!pills)return;const hd=document.querySelector(".hdr");const top=car.getBoundingClientRect().top+window.scrollY-(hd?hd.offsetHeight:0)-pills.offsetHeight;if(window.scrollY>top+2)window.scrollTo(0,Math.max(0,top))}
function markPills(name,i){const row=document.querySelector('.pills[data-car="'+name+'"]');if(!row)return;row.querySelectorAll("button").forEach((b,k)=>b.setAttribute("aria-pressed",String(k===i)));const b=row.children[i];if(b)b.scrollIntoView({block:"nearest",inline:"nearest",behavior:"smooth"})}
// switching a page's tabs is a step Back can undo
function navMark(){S.ui.stack.push({view:S.ui.view||null,y:window.scrollY,car:Object.assign({},S.ui.car),tab:S.ui.tab,plat:S.ui.plat,same:true});if(S.ui.stack.length>60)S.ui.stack.shift()}
function navCar(name,i){if((S.ui.car[name]||0)===i){render();return}navMark();S.ui.car[name]=i;render()}
function goCar(name,i){const car0=document.getElementById("car-"+name);if(car0){fitCar(car0,i);carTop(car0)}if(car0){car0._prog=true;clearTimeout(car0._pt);car0._pt=setTimeout(()=>{car0._prog=false},700)}S.ui.car[name]=i;markPills(name,i);const car=document.getElementById("car-"+name);if(car){fitCar(car,i);car.scrollTo({left:i*car.clientWidth,behavior:"smooth"})}}

// ---------- VOTE tab: one card at a time ----------
function voteText(it,v){if(isElection(it))return "for "+nameOf(v);return v==="y"?"Yes":"No"}
function queue(){
  const e=me();if(!e)return[];
  const req=e.pending.slice();const opt=e.provOpen.filter(it=>!isClosed(it)).sort((a,b)=>a.closes-b.closes);
  const all=req.concat(opt);const sk=S.ui.skip||[];
  let out=all.filter(it=>!sk.includes(it.id)).concat(all.filter(it=>sk.includes(it.id)));
  if(S.ui.front){const f=out.find(it=>it.id===S.ui.front);if(f)out=[f].concat(out.filter(it=>it!==f))}
  return out;
}
function voteCardHtml(it,vo){vo=vo||{};
  const t=tally(it);const closed=isClosed(it);const repIt=it.replaces&&S.items[it.replaces];
  let card;
  if(it.kind==="principle")card=it.moves||it.removes?'<p class="cardtext big">'+esc(it.text)+'</p>':'<p class="cardtext big">'+esc(it.text)+'</p>';
  else if(it.kind==="office"||it.kind==="promote")card='<p class="cardtext">'+titleHtml(it)+'</p>'+(it.purpose?'<p class="cardsub">'+esc(it.purpose)+'</p>':'')+(it.reason?'<p class="cardsub">'+esc(it.reason)+'</p>':'');
  else card='<p class="cardtext">'+esc(it.title)+'</p><p class="cardsub">'+esc(it.body)+'</p>';
  {const tg=it.replaces||it.removes||it.moves;if(tg&&!closed&&CAP[it.kind]&&S.items[tg]&&!seatOf(S.items[tg]))card+='<p class="cardmeta">Heads up: the '+KIND_ONE[it.kind]+' this changes is no longer in force. If this passes, it has no effect.</p>'}
  if(it.kind==="plan"&&(it.links||[]).length)card+='<p class="cardmeta">Delivers: '+(it.links||[]).map(id=>{const p=S.items[id];return p?'<button type="button" class="tlink" data-act="open-item" data-v="'+id+'">'+esc(p.title)+'</button>':''}).join(", ")+'</p>';
  if(repIt)card+='<p class="cardmeta">'+(closed&&t.pass?'Replaced':'Replaces')+' #'+(ASG[repIt.id]||it.slot||"?")+': <button type="button" class="tlink" data-act="open-item" data-v="'+repIt.id+'">'+esc(itemTitle(repIt))+'</button></p>';
  const rb=closed&&t.pass&&CAP[it.kind]?replacedBy(it):null;
  if(rb)card+='<p class="cardmeta">Later replaced by <button type="button" class="tlink" data-act="open-item" data-v="'+rb.id+'">'+esc(itemTitle(rb))+'</button></p>';
  if(it.kind==="promote"){const pv=S.items["prov-"+it.id];if(pv)card+='<p class="cardmeta"><button type="button" class="tlink" data-act="open-item" data-v="'+pv.id+'">Go to the BC-wide vote</button></p>'}
  const swipeable=!vo.noswipe&&!closed&&!isElection(it)&&myVote(it.id)==null&&canVoteOn(it)&&!S.readOnly;
  const pick=S.ui.pick&&S.ui.pick.id===it.id?S.ui.pick.v:null;
  return '<div class="votecard'+(swipeable?' swipe':'')+(vo.open?' opens':'')+(pick==="y"?' lean-y':pick==="n"?' lean-n':'')+'" id="votecard" data-id="'+it.id+'"'+(vo.open?' role="button" tabindex="0" data-act="open-card" data-v="'+it.id+'"':'')+'>'+(it.kind==="principle"?cardHead(prinAction(it),scopeLabel(it)):'<div class="cardtop">'+esc(scopeLabel(it))+' · '+esc(kindLabel(it))+'</div>')+card+(swipeable?'<span class="stamp sy">YES</span><span class="stamp sn">NO</span>':'')+'</div>';
}
function prinVotes(sc){sc=sc||myCell();return Object.values(S.items).filter(it=>it.kind==="principle"&&(sc==="prov"?it.level==="prov":it.cell===sc&&it.level!=="prov"))}
function votesPanel(sc){const all=prinVotes(sc);const open=all.filter(it=>!isClosed(it)).sort((a,b)=>(myVote(a.id)!=null)-(myVote(b.id)!=null)||a.closes-b.closes);const done=all.filter(isClosed).sort((a,b)=>b.closes-a.closes);
  return '<div class="secthd"><h2>Open</h2><span class="muted">'+open.length+'</span></div>'+(open.length?'<div class="vlist">'+open.map(voteRow).join("")+'</div>':'<div class="card empty">No principle votes open.</div>')+
  '<div class="secthd"><h2>Decided</h2><span class="muted">'+done.length+'</span></div>'+(done.length?'<div class="vlist">'+done.map(voteRow).join("")+'</div>':'<div class="card empty">Nothing decided yet.</div>')}
function notifs(){const out=[];const mine=it=>it.by===S.me;
  for(const it of Object.values(S.items)){if(!liveItem(it))continue;const o=outcome(it);const mv=myVote(it.id);const t=Math.min(decidedAt(it),isClosed(it)?it.closes:now());
    if(it.kind==="promote"){const inGrid=it.cell===myCell();const tt=tally(it);const pv=S.items["prov-"+it.id];
      if(isVoid(it)){if(mine(it)||mv!=null)out.push({it,t:it.closes<now()?it.closes:now(),cls:"no",head:"Voided: your grid changed this principle"});continue}
      if(tt.pass&&(mine(it)||mv!=null||inGrid))out.push({it:pv||it,t:pv?pv.at:it.closes,cls:"yes",head:"Your grid is sending this to BC"});
      else if(isClosed(it)&&(mine(it)||mv!=null))out.push({it,t:it.closes,cls:"no",head:"Your grid didn't send this to BC"});continue}
    if(isVoid(it)){if(mine(it))out.push({it,t:isFinite(t)?t:it.at,cls:"no",head:"Your proposal was voided"});else if(mv!=null)out.push({it,t:isFinite(t)?t:it.at,cls:"no",head:"A vote you cast was voided"});continue}
    if(mine(it)&&!isClosed(it)&&qApplies(it)&&!qInfo(it).met){out.push({it,t:it.at,cls:"",head:"Your proposal is gathering support"});continue}
    if(mine(it)&&effective(it))out.push({it,t:decidedAt(it),cls:"yes",head:o.early?"Your proposal passed early":"Your proposal passed"});
    else if(mine(it)&&isClosed(it))out.push({it,t:it.closes,cls:"no",head:"Your proposal was rejected"});
    else if(mv!=null&&isClosed(it))out.push({it,t:it.closes,cls:effective(it)?"yes":"",head:effective(it)?"A vote you cast passed":"A vote you cast was rejected"});}
  return out.sort((a,b)=>b.t-a.t)}
function needsVote(){const e=me();return e?e.pending.filter(it=>!((it.kind==="principle"||it.kind==="promote")&&isVoid(it))&&!isMuted(it)).sort((a,b)=>a.closes-b.closes):[]}
function bcWaiting(){const e=me();return e?e.provOpen.filter(it=>liveItem(it)&&!isVoid(it)).sort((a,b)=>a.closes-b.closes):[]}
function voteHome(){
  const need=needsVote();const bcw=bcWaiting();const nf=notifs().slice(0,40);
  const seen=(myMember()&&myMember().seenAt)||0;const unread=nf.filter(n=>n.t>seen).length;
  const row=n=>prinRow(n.it,'<span class="nhead'+(n.cls?' '+n.cls:'')+'">'+(n.t>seen?'<i class="udot" aria-label="New"></i>':'')+esc(n.head)+'</span>',{noStatus:true,merge:true,unread:n.t>seen});
  const sep=(l,r)=>'<div class="vsep"><span>'+l+'</span><b>'+r+'</b></div>';
  const day=864e5,t0=new Date();t0.setHours(0,0,0,0);const grp=n=>n.t>=t0.getTime()?"Today":n.t>=t0.getTime()-6*day?"This week":"Earlier";
  const grouped=()=>{let h="",cur=null,buf=[];const flush=()=>{if(buf.length)h+='<div class="ngroup">'+cur+'</div><div class="vlist">'+buf.join("")+'</div>';buf=[]};for(const n of nf){const g=grp(n);if(g!==cur){flush();cur=g}buf.push(row(n))}flush();return h};
  return '<div><h1 style="margin:0">Notifications</h1><p class="muted small" style="margin:4px 0 0">What needs your vote, and what has changed.</p></div>'+
  sep("Needs your vote",need.length)+(need.length?'<div class="vlist">'+need.map(it=>it.kind==="principle"||it.kind==="promote"?prinRow(it,'',{inNeed:true}):voteRow(it)).join("")+'</div>':'<div class="card empty">You\'re all caught up.</div>')+
 (bcw.length?sep("BC-wide · optional",bcw.length)+'<div class="vlist">'+bcw.map(it=>prinRow(it,'',{inNeed:true})).join("")+'</div>':'')+
  sep("Updates"+(unread?' · <span class="ucount">'+unread+' new</span>':''),unread?'<button type="button" class="tlink small plain" data-act="mark-read">Mark all read</button>':nf.length)+(nf.length?'<div class="vlist">'+nf.map(row).join("")+'</div>':'<div class="card empty">Nothing yet. Results of your proposals and votes will show up here.</div>')+
  '<p class="muted small" style="margin:0">Find any vote, in any grid, on the <button type="button" class="tlink small plain" data-act="tab" data-v="search">Votes</button> tab.</p>';
}
function myChip(it){
  const mv=myVote(it.id);if(mv==null&&qApplies(it)&&!isClosed(it)&&!qInfo(it).met)return '';
  if(mv!=null)return '<span class="chip mine">You voted '+esc(voteText(it,mv))+'</span>';
  const e=me();const elig=e&&e.elig[it.id];
  if(!isClosed(it))return elig?(required(it)?'<span class="chip need">Vote needed</span>':'<span class="chip">Optional</span>'):'';
  if(elig&&required(it)&&e.missed.includes(it))return '<span class="chip no">You missed this</span>';
  if(required(it)&&e.boxedOut.includes(it))return '<span class="chip no">In penalty box</span>';
  return '';
}
// time left as a filled share of a circle, clockwise from 12 o'clock (a thick stroke on a small circle, so no arc math)
function pie(f){f=Math.max(0,Math.min(1,f));const C=2*Math.PI*3.5;
  return '<svg class="pie" viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="7.5" class="pbg"/>'+(f>0?'<circle cx="9" cy="9" r="3.5" class="pfs" stroke-dasharray="'+(f*C).toFixed(2)+' '+C.toFixed(2)+'" transform="rotate(-90 9 9)"/>':'')+'</svg>'}
// the outcome chip, the same word everywhere (list rows, the vote page, Details)
function endChip(it){const o=outcome(it);if(it.kind!=="principle"&&it.kind!=="promote")return '<span class="chip '+o.cls+'">'+esc(o.label)+'</span>';
  const closed=isClosed(it)||it.voided;if(!closed&&!o.early&&o.key!=="void"&&!(qApplies(it)&&!qInfo(it).met))return '';
  return '<span class="chip '+o.cls+'">'+esc(o.label)+(o.key==="open"&&qApplies(it)&&!qInfo(it).met&&qShow(it)?' · '+qProg(it):'')+'</span>'}
// "X of Y voted", counting this member's own vote at once while it's still on its way to the hosts
function sending(it){try{return !!(window.CPAccount&&window.CPAccount.unsent&&window.CPAccount.unsent("items/"+it.id))}catch(e){return false}}
function votedN(it){const t=tally(it);const mv=myVote(it.id);const sent=mv!=null&&ballotsOf(it).some(b=>b.k===myKey(it));const sending=mv!=null&&!sent;
  return{n:t.voters+(sending?1:0),of:t.eligible,sending,text:(t.voters+(sending?1:0))+' of '+t.eligible+' voted'+(sending?' (sending…)':'')}}
function actWord(it){return it.removes?"Delete":it.moves?"Move":it.replaces?"Replace":"Add"}
function fshort(t){const d=now()-t;if(d>=0&&d<7*864e5){const h=Math.floor(d/36e5);return h<1?'just now':h<24?h+'h ago':Math.floor(h/24)+'d ago'}try{const D=new Date(t),N=new Date();return D.toLocaleDateString(undefined,D.getFullYear()===N.getFullYear()?{month:"short",day:"numeric"}:{month:"short",day:"numeric",year:"numeric"})}catch(e){return fdate(t)}}
function moveTag(it){if(!it.moves||isClosed(it))return "";const x=S.items[it.moves];const f=x&&seatOf(x);return f&&it.to?' #'+f+' → #'+it.to:''}
function prinRow(it,head,opt){opt=opt||{};const isP=it.kind==="promote";const src=isP?S.items[it.src]:null;const closed=isClosed(it)||it.voided;const vd=isVoid(it);const o=outcome(it);
  const ms=it.closes-now();const urg=!closed&&ms<6*36e5?' urg2':!closed&&ms<24*36e5?' urg1':'';
  const span=Math.max(1,it.closes-it.at);const tl=closed?'<span class="vtime">Closed '+fshort(it.closes)+'</span>':'<span class="vtime'+urg+'">'+pie(ms/span)+esc(left(ms).replace(/ left$/,''))+'</span>';
  const won=isP?tally(it).pass&&(closed||tally(it).early==="pass"):effective(it);const nq=qApplies(it)&&!vd&&!qInfo(it).met;const qi=nq?qInfo(it):null;
  const status=(opt.noStatus?'':endChip(it))+(it.by===S.me&&sending(it)?'<span class="chip">Sending…</span>':'');
  const mv=myVote(it.id);const quiet=mv!=null?'<span class="myv'+(mv==="y"?' y':' n')+'">'+(mv==="y"?'✓ You: Yes':'✕ You: No')+'</span>':'';
  let mine=mv!=null?quiet:closed||vd?'':myChip(it);
  const need=!closed&&!vd&&/chip need/.test(mine);if(opt.merge&&mv==null)mine='';
  const aw=isP?"BC-wide":actWord(it);const typ='<span class="vtype a-'+(isP?'moved':aw.toLowerCase())+'">Principle · '+(isP?'Send to BC':aw+moveTag(it))+'</span>';
  const who=it.by?' · '+esc(nameOf(it.by)):'';
  const top='<span class="vtop"><span class="vmeta2">'+esc(scopeLabel(it))+who+'</span>'+tl+'</span>'+typ;
  const title=isP?(it.text||(src?src.text||itemTitle(src):'')):it.text;
  return '<div class="vrow'+(need&&!opt.inNeed&&!opt.merge?' needrow':'')+(opt.unread?' unread':'')+'" role="button" tabindex="0" data-act="open-item" data-v="'+it.id+'">'+(need&&!opt.inNeed&&!opt.merge?'<i class="needbang" aria-label="Needs your vote">!</i>':'')+(head||'')+top+'<span class="vtitle">'+esc(title)+'</span>'+(status||mine?'<span class="vfoot">'+status+mine+'</span>':'')+'</div>'}
function voteRow(it){const h=voteRow0(it);return /chip need/.test(h)&&!/class="vrow needrow/.test(h)?h.replace(/class="vrow"([^>]*)>/,'class="vrow needrow"$1><i class="needbang" aria-label="Needs your vote">!</i>'):h}
function voteRow0(it){
  if(it.kind==="principle"||(it.kind==="promote"&&liveItem(it)))return prinRow(it);
  if(it.kind==="principle"&&!isClosed(it)){const o0=outcome(it);const chip=isVoid(it)?'<span class="chip no">Void</span>':(o0.label==="Ratified early"?'<span class="chip yes">Ratified early</span> ':'')+myChip(it);return '<div class="vrow" role="button" tabindex="0" data-act="open-item" data-v="'+it.id+'"><span class="vtop"><span>'+esc(prinAction(it))+'</span><span>'+left(it.closes-now())+'</span></span><span class="vtitle">'+esc(it.text)+'</span>'+(chip?'<span class="vfoot">'+chip+'</span>':'')+'</div>'}
  const o=outcome(it);const open=!isClosed(it);const chip=open?myChip(it):'<span class="chip '+o.cls+'">'+esc(o.label)+'</span>';
  return '<div class="vrow" role="button" tabindex="0" data-act="open-item" data-v="'+it.id+'"><span class="vtop"><span>'+esc(scopeLabel(it))+' · '+esc(kindLabel(it))+'</span><span>'+(open?left(it.closes-now()):fdate(it.closes))+'</span></span><span class="vtitle">'+esc(itemTitle(it))+'</span>'+(chip?'<span class="vfoot">'+chip+'</span>':'')+'</div>';
}
function vsState(){if(!S.ui.vs)S.ui.vs={q:"",st:"all",sc:"all",n:30};if(S.ui.vs.st==="need")S.ui.vs.st="all";return S.ui.vs}
function vsMatch(){const f=vsState();const nw=f.sort==="new";const q=f.q.trim().toLowerCase();const mc=myCell();
  return Object.values(S.items).filter(it=>{if(!liveItem(it))return false;if(!S.ui.showIgn&&isMuted(it))return false;
    if(f.sc==="mine"&&!(it.level!=="prov"&&it.cell===mc))return false;if(f.sc==="bc"&&it.level!=="prov")return false;if(f.sc!=="all"&&f.sc!=="mine"&&f.sc!=="bc"&&it.cell!==f.sc)return false;
    if(f.st==="open"&&isClosed(it))return false;if(f.st==="closed"&&!isClosed(it))return false;
    if(f.st==="need"&&!(needsVote().includes(it)))return false;
    if(q){const hay=(itemTitle(it)+" "+(it.text||"")+" "+(it.body||"")+" "+scopeLabel(it)+" "+(it.kind==="principle"?prinAction(it):kindLabel(it))+" "+nameOf(it.by||"")).toLowerCase();if(!q.split(/\s+/).every(w=>hay.includes(w)))return false}
    return true}).sort((a,b)=>(isClosed(a)-isClosed(b))||(nw?b.at-a.at:isClosed(a)?b.closes-a.closes:a.closes-b.closes))}
function vsResults(){const f=vsState();const all=vsMatch();const shown=all.slice(0,f.n);
  const nIgn=Object.values(S.items).filter(it=>liveItem(it)&&isMuted(it)).length;
  return (nIgn?'<p class="muted small ignnote">'+(S.ui.showIgn?'Showing ':'')+plural(nIgn,'proposal')+' from members you ignore'+(S.ui.showIgn?'.':' '+(nIgn===1?'is':'are')+' hidden.')+' <button type="button" class="tlink" data-act="show-ign">'+(S.ui.showIgn?'Hide them':'Show them')+'</button> · <button type="button" class="tlink" data-act="why-ign">Why?</button></p>':'')+(f.q.trim()?'<p class="muted small" style="margin:0 0 8px">'+all.length+' vote'+(all.length===1?'':'s')+' match “'+esc(f.q.trim())+'”</p>':'')+
    (shown.length?(()=>{const rw=it=>it.kind==="principle"?prinRow(it):voteRow(it);const op=shown.filter(it=>!isClosed(it)),cl=shown.filter(it=>isClosed(it));const sep=(t,n)=>'<div class="vsep"><span>'+t+'</span><b>'+n+'</b></div>';
      return f.st==="all"?(op.length?sep("Open",all.filter(it=>!isClosed(it)).length)+'<div class="vlist">'+op.map(rw).join("")+'</div>':'')+(cl.length?sep("Closed",all.filter(isClosed).length)+'<div class="vlist">'+cl.map(rw).join("")+'</div>':''):'<div class="vlist">'+shown.map(rw).join("")+'</div>'})():(f.q.trim()||f.st!=="all"||f.sc!=="all"?'<div class="card empty">No votes match. <button type="button" class="tlink plain" data-act="vs-clear">Clear search and filters</button></div>':'<div class="card empty">No votes yet.</div>'))+
    (all.length>shown.length?'<button type="button" class="btn block" data-act="vs-more">Show more ('+(all.length-shown.length)+' left)</button>':'')}
function recLink(){const st=recStatus();return '<button type="button" class="reclink '+st.cls+'" data-act="open-record"><span class="recic">'+st.icon+'</span><span>Your vote receipts<small>'+(VER?(VER.probs.length?st.title:VER.blocks?plural(VER.votes,'vote')+' on the record · checks out':'No votes yet'):'Signed, sealed and checkable')+'</small></span><span class="chev">›</span></button>'}
function searchView(){maybeVerify();const f=vsState();const mc=myCell();
  const cells=[...new Set(Object.values(S.items).filter(it=>it.level!=="prov"&&it.cell&&it.cell!==mc).map(it=>it.cell))].sort((a,b)=>gridName(a).localeCompare(gridName(b)));
  const need=needsVote().length;
  const cnt=st=>{const k=f.st;f.st=st;const n=vsMatch().length;f.st=k;return n};
  const chips=[["all","All"],["open","Open"],["closed","Closed"]].map(([k,l])=>[k,l+' <span>'+cnt(k)+'</span>']);
  return '<div><h1 style="margin:0">Votes</h1><p class="muted small" style="margin:4px 0 0">Every vote, in every grid and BC-wide.</p></div>'+
  '<div class="vsticky"><div class="vsbar"><input class="inp" id="vs-q" type="search" placeholder="Search votes" value="'+esc(f.q)+'" autocomplete="off" aria-label="Search votes">'+
  '<select class="inp" id="vs-sc" aria-label="Where"><option value="all"'+(f.sc==="all"?' selected':'')+'>Everywhere</option><option value="mine"'+(f.sc==="mine"?' selected':'')+'>'+esc(gridName(mc))+' (yours)</option><option value="bc"'+(f.sc==="bc"?' selected':'')+'>BC-wide</option>'+cells.map(c=>'<option value="'+c+'"'+(f.sc===c?' selected':'')+'>'+esc(gridName(c))+'</option>').join("")+'</select></div>'+
  '<div class="vfilt" role="group" aria-label="Status">'+chips.map(([k,l])=>'<button type="button" data-act="vs-st" data-v="'+k+'" aria-pressed="'+(f.st===k)+'">'+l+'</button>').join("")+'<button type="button" class="vsort" data-act="vs-sort">'+(f.sort==="new"?'Newest first':'Ending soon')+' ⇅</button></div></div>'+
  '</div><div id="vs-res">'+vsResults()+'</div>'+recLink()}
function allVotesView(){
  const cell=myCell();
  const mine=Object.values(S.items).filter(it=>it.level==="prov"||it.cell===cell);
  const panels=CATS.map(([k])=>{
    const list=k==="all"?mine:mine.filter(it=>catOf(it)===k);
    const open=list.filter(it=>!isClosed(it)).sort((a,b)=>a.closes-b.closes),closed=list.filter(isClosed).sort((a,b)=>b.closes-a.closes);
    return '<div class="secthd"><h2>Open</h2><span class="muted">'+open.length+'</span></div>'+(open.length?'<div class="vlist">'+open.map(voteRow).join("")+'</div>':'<div class="card empty">Nothing open.</div>')+
      '<div class="secthd"><h2>Closed</h2><span class="muted">'+closed.length+'</span></div>'+(closed.length?'<div class="vlist">'+closed.map(voteRow).join("")+'</div>':'<div class="card empty">Nothing closed yet.</div>');
  });
  return backBtn+carousel("vote",CATS.map(c=>c[1]),panels);
}

// ---------- item page ----------
function prinVotePage(it){const closed=isClosed(it);const t=tally(it);const o=outcome(it);const mv=myVote(it.id);const L=liveSeries(it);const min=Math.max(1,S.cfg.minVoters||1);
  const rep=it.replaces&&S.items[it.replaces];
  const vd=(it.kind==="principle"||it.kind==="promote")&&isVoid(it);
  const later=it.kind==="principle"&&closed&&!vd?supersededBy(it.id):null;
  const note=vd?voidNoteHtml(it):
    it.kind==="principle"?(later?'<div class="voidnote soft"><b>Passed</b>, then later '+(later.removes?'removed':later.moves?'moved':'replaced')+' on '+fdate(decidedAt(later))+(later.removes||later.moves?'':' by “'+esc(later.text)+'”')+'. <button type="button" class="tlink plain" data-act="open-item" data-v="'+later.id+'">See that vote ›</button></div>':''):later?'<div class="voidnote soft">Later '+(later.removes?'removed by':'replaced by')+' <button type="button" class="tlink plain" data-act="open-item" data-v="'+later.id+'">'+esc(later.removes?'a vote to remove it':later.text)+'</button>.</div>':'';
  const clk='<div class="eyebrow simclock">'+CLOCK+'<span>'+(vd?'Closed early · void':closed?'Voting closed '+fdate(it.closes):esc(left(it.closes-now()).replace(/ left$/,''))+' remaining')+'</span></div>';
  const card=it.kind==="promote"?chipHead("Send to BC","",'')+routeLine(it.cell)+'<h1 style="margin:0">The vote</h1>'+clk+note:(it.kind!=="principle"?clk+voteCardHtml(it).replace(/<\/div>$/,'')+(it.by?'<p class="cardby">Proposed by <button type="button" class="tlink plain" data-act="open-member" data-v="'+it.by+'">'+esc(nameOf(it.by))+'</button> · '+fdt(it.at)+'</p>':'')+(mv!=null?'<div class="cardvote '+(mv==="y"?'cv-y':'cv-n')+'">'+(mv==="y"?'✓ You voted Yes':'✕ You voted No')+'</div>':'')+'</div>':
    chipHead(actWord(it),scopeLabel(it),'',it.level==="prov"?"prov":it.cell)+vcard({chip:endChip(it),left:vd?'Closed early':closed?'Closed '+fshort(it.closes):esc(left(it.closes-now())),
      pre:rep?'<p class="cardmeta" style="margin:0">Replaces: '+esc(rep.text)+'</p>':'',text:it.removes?'Remove: '+it.text:it.text,mine:mv,pop:S.ui.justVoted===it.id,mid:sendStatus(it),
      foot:(it.level==="prov"?t.q<MIN_GRIDS:t.voters<(t.priv||t.min))?'<span class="muted small">'+esc(votedN(it).text)+'</span>':'<button type="button" class="tlink small plain" data-act="open-cast" data-v="'+it.id+'">'+esc(votedN(it).text)+' ›</button>'})+note);
  const P=it.kind==="principle";
  const ticks=liveTicks(L);
  const hide=it.level==="prov"?t.q<MIN_GRIDS:t.voters<(t.priv||t.min);
  const vn=votedN(it);const pv=t.priv||min;
  const qq=qApplies(it)?qInfo(it):null;
  const lockedNow=it.level==="prov"?t.q<MIN_GRIDS:t.voters<pv;S.ui.locked=S.ui.locked||{};let fade='';
  if(lockedNow)S.ui.locked[it.id]=1;else if(S.ui.locked[it.id]){delete S.ui.locked[it.id];fade=' fadein'}
  const sum=!P||vd||!closed?'':o.label==="Expired"?'<p class="outsum"><b>Expired.</b> It needed '+qq.need+' supporter'+(qq.need===1?'':'s')+' within its 72 hours'+(qShow(it)?' and got '+qq.yes:'')+', so it never went to a full vote.</p>':
    o.label==="Passed"?'<p class="outsum"><b>Passed.</b> It had enough supporters, and a majority voted Yes.'+(it.full?' Voting closed early because everyone had voted.':'')+'</p>':
    o.label==="Rejected"?'<p class="outsum"><b>Rejected.</b> '+(qq&&qq.met?'It went to a full vote but didn\'t get a majority.':'It didn\'t get a majority.')+(it.full?' Voting closed early because everyone had voted.':'')+'</p>':'';
  const sup=!P||!qq||closed||vd?'':qq.met?'<p class="gofull">✓ Going to a full vote · 51% needed to pass</p>':supLine(qShow(it)?qq.yes:null,qq.need);
  const top=P?'':'<div class="secthd">'+endChip(it)+(hide?'<span class="muted small">'+esc(vn.text)+'</span>':'<button type="button" class="tlink small plain" data-act="open-cast" data-v="'+it.id+'">'+esc(vn.text)+' ›</button>')+'</div>';
  const chart=hide?lockChart(it.level==="prov"?t.q:vn.n,pv,it.level==="prov"):'<div class="'+fade.trim()+'">'+lineChart(L.ser.length>1?L.ser:[[0,0],[0,0]],{ticks:L.count?ticks:['Start','','Now'],max:L.count<min?min:0})+
    '<div class="secthd small"><span style="color:var(--yes);font-weight:700">Yes '+t.y+'</span><span style="color:var(--no);font-weight:700">No '+t.n+'</span></div>'+
    '<p class="small turnline'+(t.voters>=t.min?' ok':'')+'">'+(t.voters>=t.min?'✓ Minimum of '+t.min+' vote'+(t.min===1?'':'s')+' met':'Needs at least '+t.min+' votes')+'</p></div>';
  const res='<div class="card results">'+top+sum+sup+(closed&&P&&o.label==="Expired"&&hide?'':chart)+'</div>';
  const byGrid=it.level==="prov"&&!hide?'<div class="card wc"><div class="wch">By grid</div>'+Object.keys(t.byCell).filter(c=>t.byCell[c].y+t.byCell[c].n>=t.min).sort((a,b)=>gridName(a).localeCompare(gridName(b))).map(c=>{const g=t.byCell[c];return '<div class="kv"><span>'+gridLink(c,gridName(c))+'</span><span>'+(g.y>g.n?'<span class="kvy">In favour</span>':'<span class="kvn">Against</span>')+' <span class="muted">'+g.y+'–'+g.n+'</span></span></div>'}).join("")+'<p class="muted small" style="margin:8px 0 0">Grids that haven\'t reached '+t.min+' votes aren\'t shown.</p></div>':'';
  const facts=it.level==="prov"?byGrid:'';const _unusedFacts=()=>voteFacts({closed,full:it.full,y:t.y,n:t.n,min:t.min,members:t.eligible,decided:t.early,left:closed?'':left(it.closes-now()).replace(/ left$/,''),hours:Math.round((it.closes-it.at)/3600e3)});
  const owner=S.isOwner&&DEMO()&&!closed?'<button type="button" class="btn ghost" data-act="end-now" data-id="'+it.id+'">Owner test tool: end this vote now</button>':'';
  const more="";
  let det='';if(it.kind==="principle"||it.kind==="promote"){const ea=effective(it)&&!vd?earlyAt(it):null;const vc=vd?voidCause(it):null;
    const mk=b=>b?'<span class="kvy">✓ Met</span>':'<span class="kvn">Not met</span>';
    det=detailCard([
      it.by?['Proposed by','<button type="button" class="tlink plain" data-act="open-member" data-v="'+it.by+'">'+esc(nameOf(it.by))+'</button>']:null,
      ['Proposed',fdt(it.at)],
      vd?['Voided',fdt(it.closes)+(vc?' · <button type="button" class="tlink plain" data-act="open-item" data-v="'+vc.id+'">why ›</button>':'')]:
      ea?['Passed',fdt(ea)+' <span class="muted">(early)</span>']:
      closed?[esc(o.label),fdt(it.closes)]:
      t.early==="fail"?['Decided','Can no longer pass']:['Decided','Not yet'],
      [closed||vd?'Voting closed':'Voting closes',fdt(it.closes)+(it.full?' <span class="muted">(everyone voted)</span>':'')+(closed||vd?'':' <span class="muted">('+esc(left(it.closes-now()).replace(/ left$/,''))+' left)</span>')],
      it.kind==="promote"?['Needed','More than half of all '+t.eligible+' members ('+(Math.floor(t.eligible/2)+1)+' Yes)']:null,
      it.level==="prov"?['Grids in favour',(t.q>=MIN_GRIDS?t.yc:'—')+' of '+t.G+' <span class="muted">(needs '+(Math.floor(t.G/2)+1)+')</span>']:null,
      qApplies(it)?['Supporters',(()=>{const q=qInfo(it);return q.met?'<span class="kvy">✓ '+q.need+' reached</span>':(qShow(it)?q.yes+' of ':'')+q.need+' <span class="muted">'+(closed?'(not reached)':'needed')+'</span>'})()]:null,
      it.level==="prov"?['Grids reporting',t.q+' <span class="muted">(results show at '+MIN_GRIDS+')</span>']:['Minimum of '+t.min+' vote'+(t.min===1?'':'s'),mk(t.voters>=t.min)],
      it.level==="prov"&&it.fromCell?['Sent by',gridLink(it.fromCell,gridName(it.fromCell))+(it.via&&S.items[it.via]?' · <button type="button" class="tlink plain" data-act="open-item" data-v="'+it.via+'">grid vote ›</button>':'')]:null,
      it.kind==="promote"&&S.items["prov-"+it.id]?['BC-wide vote','<button type="button" class="tlink plain" data-act="open-item" data-v="prov-'+it.id+'">see it ›</button>']:null,
      !vd&&!later&&effective(it)&&seatOf(it)?['Now','#'+seatOf(it)+' on the list · <button type="button" class="tlink plain" data-act="goto-grid" data-v="'+(it.level==="prov"?"prov":it.cell)+'">see principles ›</button>']:null,
      later?['Later '+(later.removes?'removed':later.moves?'moved':'replaced'),fdt(decidedAt(later))+' · <button type="button" class="tlink plain" data-act="open-item" data-v="'+later.id+'">see that vote ›</button>']:null,
      ['Your vote',mv==="y"?'<span class="kvy">Yes</span>':mv==="n"?'<span class="kvn">No</span>':'<span class="muted">'+(closed||vd?"Didn't vote":"Not yet")+'</span>']])}
  const bal=mv==null&&!vd&&!closed&&canVoteOn(it)&&!S.readOnly&&!(S.ui.view&&S.ui.view.from==="member");
  if(bal)return backBtn+card+res+ballotBlock(it);
  return backBtn+card+res+det+(vd?'':facts)+(mv==null&&!vd?ballotBlock(it):'')+(more?'<details class="more"><summary>⋯ More actions</summary>'+more+'</details>':'')+owner}
function promoteChange(it){const sl=seated("principle","prov",null);const ids=Object.keys(sl).map(Number).sort((a,b)=>a-b).map(k=>sl[k]);const texts=ids.map(x=>x.text);const text=it.text||(S.items[it.src]||{}).text||"";
  let c;const n=it.replaces?ids.findIndex(x=>x.id===it.replaces)+1:0;if(n)c={kind:"reword",n,text};else c={kind:"add",at:texts.length+1,text};
  return '<div class="card wc plbox">'+bcListHead()+'<div class="plist compact">'+verRows(changeV(texts,c))+'</div></div>'}
function itemView(it){
  const closed=isClosed(it);
  if(it.kind==="promote"){const stage=(S.ui.istage||{})[it.id];
    if(stage!=="ballot"){const fromM=S.ui.view&&S.ui.view.from==="member";const canV=!closed&&!fromM&&myVote(it.id)==null&&canVoteOn(it)&&!S.readOnly;const vdd=isVoid(it);const t=tally(it);const passed=t.pass&&!vdd;
      const src=S.items[it.src];const sn=src&&seatOf(src);const pv=S.items["prov-"+it.id];
      const g=esc(gridName(it.cell));const lede=vdd?'This was voided because '+g+' changed this principle before the vote finished. If BC had adopted it, BC\'s list would have looked like this:':passed?g+' agreed to send this to BC. If BC adopts it, BC\'s list will look like this:':closed?g+' did not agree to send this to BC. If it had, and BC adopted it, BC\'s list would have looked like this:':g+' members vote on sending this to BC. If it goes ahead and BC adopts it, BC\'s list will look like this:';
      return backBtn+'<div>'+chipHead("Send to BC","",endChip(it))+routeLine(it.cell)+'<h1 style="margin:0">Proposed change</h1></div>'+
        (sn?'<p class="muted small" style="margin:0">Now #'+sn+' on '+gridLink(it.cell,gridName(it.cell)+'\'s list')+'</p>':'')+'<p class="lede" style="margin:0">'+lede+'</p>'+(vdd?voidNoteHtml(it):'')+promoteChange(it)+
        (pv?'<p class="muted small" style="margin:0"><button type="button" class="tlink plain" data-act="open-item" data-v="'+pv.id+'">Go to the BC-wide vote ›</button></p>':'')+
        '<button type="button" class="btn pri block" data-act="istage" data-v="'+it.id+'">'+(closed||vdd?'See the result →':'Cast your vote →')+'</button>'}
    return prinVotePage(it)}
  if(it.kind==="principle"){const stage=(S.ui.istage||{})[it.id];
    if(stage!=="ballot"){const ch=itemChange(it);const fromM=S.ui.view&&S.ui.view.from==="member";const canV=!closed&&!fromM&&myVote(it.id)==null&&canVoteOn(it)&&!S.readOnly;
      const vdd=isVoid(it);const passed=effective(it)&&!vdd;const done=closed||passed;const h=done?(passed?'What changed':'Proposed change'):'Proposed change';
      const lede=vdd?'This change was proposed, but another vote passed first and voided it. Here is what it would have done.':!closed&&passed?'More than half of the grid voted Yes, so this took effect early. This is how '+(it.level==="prov"?"BC\'s":"the grid\'s")+' principles changed.':closed?(passed?'This is how '+(it.level==="prov"?"BC\'s":"the grid\'s")+' principles changed when this passed.':'This change was proposed but did not pass. The list stayed as it was.'):'Here is what '+(it.level==="prov"?"BC\'s":"the grid\'s")+' principles would look like if this passes.';
      return backBtn+'<div>'+chipHead(actWord(it),scopeLabel(it),endChip(it),it.level==="prov"?"prov":it.cell)+'<h1 style="margin:0">'+h+'</h1></div><p class="lede" style="margin:0">'+lede+'</p>'+(it.level==="prov"&&it.fromCell?'<p class="muted small" style="margin:0">Sent by '+gridLink(it.fromCell,gridName(it.fromCell))+(it.via&&S.items[it.via]?' · <button type="button" class="tlink plain" data-act="open-item" data-v="'+it.via+'">see the grid vote ›</button>':'')+'</p>':'')+(isVoid(it)?voidNoteHtml(it):'')+(ch||'')+'<button type="button" class="btn pri block" data-act="istage" data-v="'+it.id+'">'+(closed||vdd?'See the result →':'Cast your vote →')+'</button>'}
    return prinVotePage(it)}
  if(!isElection(it))return prinVotePage(it);
  const twoStage=it.kind==="principle"&&!closed&&myVote(it.id)==null&&canVoteOn(it)&&!S.readOnly;const stage=(S.ui.istage||{})[it.id];
  const eb='<div class="eyebrow">'+(closed?'Ended '+fdate(it.closes):left(it.closes-now())+(required(it)?' · required':' · optional'))+'</div>';
  const who=it.by?'<p class="muted small" style="margin:0">Proposed by <button type="button" class="tlink plain" data-act="open-member" data-v="'+it.by+'">'+esc(nameOf(it.by))+'</button> on '+fdt(it.at)+'</p>':'';
  if(twoStage&&stage!=="ballot"){const ch=itemChange(it);
    return backBtn+eb+'<h1 style="margin:0">Proposed change</h1>'+who+'<p class="lede" style="margin:0">Here is what the grid\'s principles would look like if this passes.</p>'+(ch||voteCardHtml(it))+'<button type="button" class="btn pri block" data-act="istage" data-v="'+it.id+'">Next: Cast your vote</button>'}
  const owner=S.isOwner&&DEMO()&&!closed?'<button type="button" class="btn ghost" data-act="end-now" data-id="'+it.id+'">Owner test tool: end this vote now</button>':'';
  const more=promoteBlock(it);
  return backBtn+eb+who+voteCardHtml(it)+(twoStage?'':itemChange(it))+liveChartBlock(it)+ballotBlock(it)+resultsBlock(it)+
    (more?'<details class="more"><summary>⋯ More actions</summary>'+more+'</details>':'')+owner;
}
function ballotBlock(it){
  if(isClosed(it))return "";
  const mv=myVote(it.id);
  if(mv!=null){if(isElection(it))return '<div class="voted v-c">✓ You voted for '+esc(nameOf(mv))+'</div>';return '<div class="voted '+(mv==="y"?"v-y":"v-n")+'">'+(mv==="y"?"✓ You voted YES":"✕ You voted NO")+'</div>'}
  const e=me();
  if(!canVoteOn(it)){let why;if(it.level!=="prov"&&it.cell!==myCell())why="Only "+gridName(it.cell)+" members vote on this.";else if(e.m.joinedAt>it.at)why="Opened before you joined. You can't vote on this one.";else why=(it.at<e.m.joinedAt+S.cfg.penalty*3600e3?"Opened during your new-member wait":"Opened while you were in the penalty box")+". You can't vote on this one, and it won't count against you.";return '<div class="cantvote">'+esc(why)+'</div>'}
  const pick=S.ui.pick&&S.ui.pick.id===it.id?S.ui.pick.v:null;
  if(isElection(it)){const cands=electionCands(it);if(!cands.length)return '<div class="cantvote">Nobody is running yet.</div>';
    return '<div class="ask">Who should lead?</div><div class="stack">'+cands.map(id=>'<button type="button" class="candopt'+(pick===id?' on':'')+'" data-act="pick" data-id="'+it.id+'" data-v="'+id+'">'+avatar(id)+'<span>'+esc(nameOf(id))+'</span><i class="radio'+(pick===id?' on':'')+'"></i></button>').join("")+'</div>'+(pick?'<div class="confirmhint">Tap '+esc(nameOf(pick))+' again to cast your vote. It\'s final.</div>':'')}
  return yesNo(pick,"pick",it.id);
}
function resultsBlock(it){
  const t=tally(it);const closed=isClosed(it);const o=outcome(it);
  const vn=votedN(it);const voted=closed?'<button type="button" class="tlink small" data-act="open-cast" data-v="'+it.id+'">'+esc(vn.text)+' ›</button>':'<span class="muted small">'+esc(vn.text)+'</span>';
  let h='<div class="card results"><div class="secthd"><span class="chip '+o.cls+'">'+esc(o.label)+'</span>'+voted+'</div>';
  if(t.election){const tot=Math.max(1,t.total);
    h+=(t.rank.length?t.rank.map(id=>{const c=t.counts[id]||0;return '<div class="cand">'+avatar(id)+'<div class="tx"><div style="font-weight:700">'+esc(nameOf(id))+'</div><div class="bar" style="margin-top:6px"><b class="a" style="width:'+(c/tot*100)+'%"></b></div></div><b>'+c+'</b></div>'}).join(""):'')}
  else{const tot=Math.max(1,t.y+t.n);
    h+='<div class="bar big" style="margin:12px 0 6px"><b class="y" style="width:'+(t.y/tot*100)+'%"></b><b class="n" style="width:'+(t.n/tot*100)+'%"></b></div><div class="secthd small"><span style="color:var(--yes);font-weight:700">Yes '+t.y+'</span><span style="color:var(--no);font-weight:700">No '+t.n+'</span></div>';
    if(it.level==="prov")h+='<div style="margin-top:10px">'+bcMap(id=>{const c=t.byCell[id];if(!c)return null;const n=c.y+c.n;if(n<t.min)return{cls:"f-l",label:n};return{cls:c.y>c.n?"f-y":c.y<c.n?"f-n":"f-t",dark:true}})+'</div><p class="muted small" style="margin:6px 0 0">'+t.yc+' of '+t.q+' qualified grids say yes.</p>'}
  return h+'</div>';
}
function receipt(uid,id,v,ts){let out="";for(let k=0;k<8;k++)out+=hash(k+"|"+uid+"|"+id+"|"+v+"|"+ts).toString(16).padStart(8,"0");return out}
function castTitle(it){return it.kind==="promote"?esc(it.text||(S.items[it.src]||{}).text||""):it.kind==="principle"?esc(it.text):titleHtml(it)}
// how many copies of the record a vote was checked against: the hosts this app reads from (members' copies)
function copyCount(){try{const h=window.CPAccount&&window.CPAccount.hosts?window.CPAccount.hosts():null;if(h)return Math.max(1,h.filter(x=>x.online).length)}catch(e){}return 1}
function recLine(k,i,c,me,code,word,ts){const x=VER&&VER.byVote[k+"|"+i];if(!VER)return '<span class="muted">Checking the record…</span>';if(!x)return '<span class="muted">Signed. Members\' apps seal it into the record within a few minutes.</span>';
  if(x.v!==c)return '<span class="kvn">✕ Doesn\'t match the record</span> · block '+x.n;
  return rcptHtml(me,code,word,ts,copyCount())}
function castView(it){maybeVerify();
  {const t=tally(it);if(t.voters<t.min)return backBtn+'<div class="eyebrow">Votes cast</div><div class="card empty">🔒 The list of votes opens once '+t.min+' votes are in. '+t.voters+' so far.</div>'}
  const el=eligibleIds(it);const mk=myKey(it);const rows=ballotsOf(it).map(b=>({id:b.k,me:b.k===mk,code:voterCode(b.k),c:b.v,ts:b.t,cell:b.cell}));
  rows.sort((a,b)=>a.ts-b.ts);const missed=Math.max(0,el.length-rows.length);
  const show=c=>isElection(it)?'<span class="vv">'+esc(nameOf(c))+'</span>':'<span class="vv" style="color:var(--'+(c==="y"?'yes':'no')+')">'+(c==="y"?"Yes":"No")+'</span>';
  return backBtn+'<div class="eyebrow">Votes cast</div><h1 style="font-size:19px">'+castTitle(it)+'</h1><p class="muted" style="margin:0">'+PLAIN_VOTES+(isElection(it)?' Names shown are the candidates voted for.':'')+'</p>'+
  '<div class="card ledger"><div class="row lhead"><span>Voter</span><span>When</span><span>'+(isElection(it)?'Voted for':'Vote')+'</span></div>'+(rows.length?rows.map(r=>'<details class="lrow'+(r.me?' me':'')+'"><summary class="row"><span class="code">'+r.code+(r.me?' (you)':'')+'</span><span class="when">'+(r.ts?fdt(r.ts):'—')+'</span>'+show(r.c)+'</summary><div class="rcpt">'+recLine(r.id,it.id,r.c,r.me,r.code,isElection(it)?nameOf(r.c):r.c==="y"?"Yes":"No",r.ts)+'</div></details>').join(""):'<p class="muted">Nobody voted.</p>')+'</div>'+
  '<p class="muted small" style="margin:0">Your code for this vote is '+voterCode(mk)+'. Only your phone knows it\'s yours.'+(missed>0?' '+missed+' eligible member'+(missed===1?'':'s')+' didn\'t vote.':'')+'</p>'+recLink();
}
function setupSwipe(){
  const card=document.getElementById("votecard");if(!card||!card.classList.contains("swipe"))return;
  let x0=null,dx=0,id=null;
  card.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse")return;x0=e.clientX;dx=0;id=e.pointerId;card.setPointerCapture(id);card.style.transition="none"});
  card.addEventListener("pointermove",e=>{if(x0==null)return;dx=e.clientX-x0;card.style.transform="translateX("+dx+"px) rotate("+(dx/20)+"deg)";card.classList.toggle("drag-y",dx>40);card.classList.toggle("drag-n",dx<-40)});
  const end=()=>{if(x0==null)return;x0=null;if(Math.abs(dx)>8){card.dataset.dragged="1";setTimeout(()=>{delete card.dataset.dragged},350)}card.style.transition="";card.style.transform="";card.classList.remove("drag-y","drag-n");
    if(Math.abs(dx)>90){const v=dx>0?"y":"n";if(card.dataset.id==="tut"){S.ui.pick={id:"tut",v};render()}else{S.ui.pick={id:card.dataset.id,v};render()}}};
  card.addEventListener("pointerup",end);card.addEventListener("pointercancel",end);
}
function promoteBlock(it){
  if(!CAP[it.kind]||it.level!=="cell"||!isClosed(it)||!tally(it).pass||!seatOf(it)||myCell()!==it.cell)return "";
  const motion=Object.values(S.items).find(x=>x.kind==="promote"&&x.src===it.id&&(!isClosed(x)||tally(x).pass));
  const prov=Object.values(S.items).find(x=>x.fromItem===it.id&&(!isClosed(x)||tally(x).pass));
  const busy=openProvFromCell(it.cell);let why="";
  if(prov)why=isClosed(prov)?"Already adopted across BC.":"A BC-wide vote on this is open.";
  else if(motion)why=isClosed(motion)?"The grid agreed to send this BC-wide. The BC-wide vote opens shortly.":gridName(it.cell)+" is voting on whether to send this BC-wide.";
  else if(busy)why=gridName(it.cell)+" already has a BC-wide proposal under way. One at a time per grid.";
  else if(it.kind==="plan"){const bad=(it.links||[]).filter(id=>{const p=S.items[id];return !p||p.level!=="prov"||!seatOf(p)});if(bad.length||!(it.links||[]).length)why="Every policy this plan delivers must be adopted across BC first."}
  else if(me().inBox)why=(me().why==="new"?"New members":"Members in the penalty box")+" can't do this until "+fdt(me().until)+".";
  return '<div class="card"><h2>Take it BC-wide</h2><p class="lede" style="margin:6px 0 10px">First '+gridName(it.cell)+' votes on whether to send it. If a majority agrees, every grid in BC then votes on it.</p>'+(why?'<div class="note">'+esc(why)+'</div>':'<button type="button" class="btn pri block" data-act="promote" data-id="'+it.id+'" '+(S.readOnly?'disabled':'')+'>Propose taking it BC-wide</button>')+'</div>';
}
// A grid-approved "take it BC-wide" motion opens the BC-wide vote. Every app works the BC-wide item out the same way
// from the motion and its source, neither of which ever changes, so it isn't stored anywhere.
function provFrom(m){const src=S.rawItems[m.src];if(!src)return null;const t0=m.closes;
  const it={id:"prov-"+m.id,kind:src.kind,level:"prov",cell:null,fromItem:src.id,fromCell:m.cell,via:m.id,by:m.by,at:t0,closes:t0+S.cfg.hours*3600e3,replaces:m.replaces||null,slot:null};
  if(src.kind==="principle")it.text=m.text||src.text;else{it.title=src.title;it.body=src.body;if(src.kind==="plan")it.links=(src.links||[]).slice()}
  return it}
// Build S.items: the proposals, plus each outcome record that checks out, plus the BC-wide votes they open.
// An outcome is believed only if it's true: everyone eligible really voted, the motion really passed, or the
// proposal really was voided at that moment. A false one is ignored, and the vote just runs its normal time.
function applyEnds(items,ok){for(const id in items){const e=S.ends[id];if(!e||!ok(id,e))continue;const it=items[id]=Object.assign({},items[id]);it.closes=e.closes;if(e.full)it.full=true;if(e.voided){it.voided=true;it.voidBy=e.voidBy}}}
function buildItems(ok){const o={};for(const id in S.rawItems)o[id]=S.rawItems[id];applyEnds(o,ok);S.items=o;C={};
  const ms=Object.values(o).filter(m=>m.kind==="promote").sort((a,b)=>a.at-b.at);
  for(const m of ms){if(m.voided||!isClosed(m)||!tally(m).pass)continue;const p=provFrom(m);if(!p)continue;o[p.id]=p;C={}}
  const ps={};for(const id in o)if(id.startsWith("prov-"))ps[id]=o[id];applyEnds(ps,ok);Object.assign(o,ps);C={}}
function endHolds(id,e){const it=S.items[id],m=id.startsWith("prov-")&&S.items[id.slice(5)],raw=S.rawItems[id]||(m?provFrom(m):null);
  if(!it||!raw||typeof e.closes!=="number"||e.closes<raw.at||e.closes>raw.closes)return false;
  if(e.test)return DEMO();
  // everyone eligible had voted by then: their "I took part" is on the record, and as many ballots, cast by that time
  // everyone eligible had voted: as many ballots on the record as eligible members. The vote closed when the last of
  // them was cast (an end written too early, before the ballots arrived, is moved to that moment)
  if(e.full){const ids=eligibleIds(it);const bs=(BAL()[id]||[]).slice().sort((a,b)=>a.t-b.t);if(!ids.length||bs.length<ids.length)return false;
    const t=Math.min(raw.closes,Math.max(e.closes,bs[ids.length-1].t));if(t!==e.closes)e.closes=t;return true}
  if(e.decided)return it.kind==="promote"&&tally(it).pass;
  if(e.voided){// was it void just before then? Look at the record as it stood at that moment.
    const keep=S.items;const past={};for(const k in keep)if(keep[k].at<=e.closes)past[k]=keep[k];past[id]=raw;
    S.items=past;NOW=e.closes-1;C={};let r=false;try{r=isVoid(raw)}catch(x){}NOW=null;S.items=keep;C={};return r}
  return false}
function rebuildItems(){buildItems(()=>true);const good={};for(const id in S.ends)good[id]=endHolds(id,S.ends[id]);buildItems(id=>good[id]);S.rev=S.rev||{};S.rev.items=(S.rev.items||0)+1}

// ---------- PLATFORM tab ----------
function platScope(){return S.ui.plat||myCell()}
function peItems(){const sc=platScope();const level=sc==="prov"?"prov":"cell";const cell=level==="prov"?null:sc;const sl=seated("principle",level,cell);return Object.keys(sl).map(Number).sort((a,b)=>a-b).map(k=>({text:sl[k].text,id:sl[k].id}))}
function gridSize(c){return Object.values(S.members).filter(m=>m.cell===c).length}
function peAllowed(){const e=me();return !!(platScope()===myCell()&&!S.readOnly&&e&&!e.inBox&&(BETA_WAIVE||gridSize(myCell())>=MIN_GRID))}
function bcState(id){const f=S.items[id];if(!f)return null;const m=Object.values(S.items).filter(x=>x.kind==="promote"&&x.src===id&&!isVoid(x));const pv=Object.values(S.items).filter(x=>x.level==="prov"&&x.fromItem===id&&!isVoid(x));
  if(pv.some(x=>effective(x)&&seatOf(x)))return "in";if(pv.some(x=>!isClosed(x))||m.some(x=>!isClosed(x)||(tally(x).pass&&!S.items["prov-"+x.id])))return "voting";
  const bcs=seated("principle","prov",null);if(Object.values(bcs).some(x=>x.text===f.text))return "in";return null}
function bcBlock(id){const st=bcState(id);if(st==="in")return "Already on the BC list";if(st==="voting")return "Already on its way to BC";if(openProvFromCell(myCell()))return "Your grid already has a BC-wide proposal under way";return ""}
function peOpts(){return{act:"pe",tapFirst:peAllowed(),bc:peAllowed()&&!!S.ui.amend,ids:peItems().map(x=>x.id),tag:id=>{const st=platScope()==="prov"?null:bcState(id);const v=Object.values(S.items).find(x=>x.kind==="principle"&&!isClosed(x)&&!isVoid(x)&&(x.replaces===id||x.removes===id||x.moves===id));
    return (st==="in"?' <span class="bctag">BC</span>':st==="voting"?' <span class="bctag v">BC · voting</span>':'')+(v?' <button type="button" class="vopen" data-act="open-item" data-v="'+v.id+'">Vote open</button>':'')},canEdit:peAllowed()&&!!S.ui.amend,move:true,cap:CAP.principle,viewAct:false,doneMsg:'Go to the <button type="button" class="tlink ul" data-act="all-votes">votes</button> page to see its progress. The list only changes if it passes.'}}
async function peAct(v,el){const st=S.ui.pe||(S.ui.pe={});
  if(v==="finish"){S.ui.pe={};S.ui.amend=false;render();return}
  if(v==="tovotes"){S.ui.pe={};S.ui.amend=false;navMark();S.ui.tab="search";S.ui.view=null;render();window.scrollTo(0,0);return}const items=peItems();const r=plAct(st,v,el,items,peOpts());
  if(r.submit){if(boxedErr())return;const sub=r.submit;if(sub.kind!=="add"&&!items[sub.n-1]){S.ui.pe={};toast("That slot is empty.","warn");render();return}if(sub.text.length>LIM.principle){toast("Keep it to "+LIM.principle+" characters.");return}
    const it=newItem({kind:"principle",text:sub.text,replaces:null,slot:null});
    if(sub.kind==="add")it.pos=sub.at;else if(sub.kind==="reword")it.replaces=items[sub.n-1].id;else if(sub.kind==="move"){it.moves=items[sub.n-1].id;it.to=sub.to}else it.removes=items[sub.n-1].id;
    const id=newId();if(await guard(()=>enqueue(()=>S.db.doc("items/"+id).set(it)))){plDone(st,sub,"pe");st.done.id=id;if(window.CPAccount&&window.CPAccount.online&&!window.CPAccount.online())toast("Saved. It sends once you're online.","warn")}}
  render();if(r.focus)plFocus()}
function teamRow(o){const lh=leadHistory(o);const el=openElection(o.id);let sub,chip;
  if(o.closedAt){sub=fdate(o.start)+' – '+fdate(o.closedAt);chip='<span class="chip">Closed</span>'}else if(lh.lead){sub="Lead: "+nameOf(lh.lead);chip='<span class="chip yes">Led</span>'}else if(el){sub="Lead election open · "+left(el.closes-now());chip='<span class="chip warn">Electing</span>'}else{sub="No lead";chip='<span class="chip no">Vacant</span>'}
  return '<button type="button" class="li" data-act="open-team" data-v="'+o.id+'"><span class="tx"><span class="t">'+esc(o.name)+'</span><span class="s">'+esc(sub)+'</span></span>'+chip+'<span class="chev">›</span></button>'}
function nearCells(sc,k){if(!sc||sc==="prov")return[];const[r0,c0]=sc.split("-").map(Number);const cc=cellCounts();
  return [...LAND].filter(c=>c!==sc).map(c=>{const[r,k2]=c.split("-").map(Number);return [c,Math.max(Math.abs(r-r0),Math.abs(k2-c0))+(cc[c]?0:0.5)]}).filter(x=>x[1]<=4&&cc[x[0]]).sort((a,b)=>a[1]-b[1]||(cc[b[0]]||0)-(cc[a[0]]||0)).slice(0,k).map(x=>x[0])}
function gpRow(c,act){const cc=cellCounts();const isP=c==="prov";const n=isP?Object.keys(S.members).length:(cc[c]||0);const tw=townsIn(c);
  return '<button type="button" class="li" data-act="'+(act||"pick-grid")+'" data-v="'+c+'"><span class="tx"><span class="t">'+(isP?'All of BC':esc(gridName(c)))+(c===myCell()?' <span class="muted small">(your grid)</span>':'')+'</span><span class="s">'+(isP?'Every grid together':esc(tw.slice(0,4).join(", "))+(tw.length>4?'…':''))+'</span></span><span class="muted small">'+plural(n,'member')+'</span><span class="chev">›</span></button>'}
function gpResults(mode){const mv=mode==="move";const act=mv?"mv-pick":"pick-grid";const q=(S.ui.gpq||"").trim().toLowerCase();
  if(q.length>=2){const sg=suggHtml(q,act);const hits=[...LAND].filter(c=>(gridName(c)+" "+townsIn(c).join(" ")).toLowerCase().includes(q)).sort((a,b)=>(cellCounts()[b]||0)-(cellCounts()[a]||0)).slice(0,20);
    if(!sg&&!hits.length)return '<div class="card empty" id="gp-miss" hidden>No BC town or neighborhood matches “'+esc(q)+'”.</div>';
    return sg+(hits.length?'<div class="secthd"><h2>Grids</h2></div><div class="list">'+hits.map(c=>gpRow(c,act)).join("")+'</div>':'')}
  const recent=(S.ui.recentGrids||[]).filter(c=>c!==myCell()&&c!=="prov").slice(0,5);
  const sec=(h,cs)=>cs.length?'<div class="secthd"><h2>'+h+'</h2></div><div class="list">'+cs.map(c=>gpRow(c,act)).join("")+'</div>':'';
  return (mv?'':'<div class="list">'+gpRow(myCell(),act)+gpRow("prov",act)+'</div>'+sec("Recent",recent))+sec("Nearby",nearCells(myCell(),6).filter(c=>!recent.includes(c)))+
    '<div class="secthd"><h2>Or tap the map</h2></div>'+bcMap(id=>cellCounts()[id]?{cls:"f-mem",label:cellCounts()[id]}:null,{click:act,sel:mv?null:platScope()==="prov"?null:platScope()})}
function gridPickView(){const mv=S.ui.view&&S.ui.view.mode==="move";
  return backBtn+'<h1 style="margin:0">'+(mv?'Move to a new grid':'View a grid')+'</h1>'+
    (mv?lockWarn(true):'')+
    '<label class="f" for="gp-q">Town or neighborhood<input class="inp" id="gp-q" type="search" placeholder="Start typing" value="'+esc(S.ui.gpq||"")+'" autocomplete="off" enterkeyhint="search"></label><div id="gp-res" class="stack">'+gpResults(mv?"move":"view")+'</div>'}
function platformView(){
  const sc=platScope();const isProv=sc==="prov";const level=isProv?"prov":"cell";const cell=isProv?null:sc;const mine=sc===myCell();const counts=cellCounts();
  const n=k=>Object.keys(seated(k,level,cell)).length;
  const open=Object.values(S.items).filter(it=>it.kind==="principle"&&!isClosed(it)&&!isVoid(it)&&!isMuted(it)&&(isProv?it.level==="prov":it.cell===sc&&it.level!=="prov"));
  const vs=prinVersions(level,cell);const lv=vs.length?vs[vs.length-1]:null;
  const needN=mine?needsVote().length:0;
  const latest=needN?'<button type="button" class="glatest need" data-act="tab" data-v="vote"><b>'+needN+' vote'+(needN===1?' needs':'s need')+' you</b><span>›</span></button>':
    lv&&lv.it?'<button type="button" class="glatest" data-act="open-item" data-v="'+lv.it.id+'"><span class="gl-k">Latest</span><span class="gl-t">'+esc(pastAction(prinAction(lv.it)))+' · '+esc(lv.it.text)+'</span><span class="gl-w">'+fshort(decidedAt(lv.it))+'</span></button>':'';
  const mini='<button type="button" class="minimap" data-act="grid-pick" aria-label="View another grid">'+bcMap(id=>isProv?(counts[id]?{cls:"f-mem"}:null):(id===sc?{cls:"f-pick"}:null),{noMe:true})+'</button>';
  const head='<div class="ghead">'+mini+'<div class="ghead-t"><h1 class="gtitle"><span>'+(isProv?'All of BC':esc(gridName(sc)))+'</span>'+(mine?'<small class="gmine">(your grid)</small>':'')+'</h1>'+
    '<p class="gsum">'+(isProv?plural(Object.keys(counts).length,'grid')+' with members':townsLine(townsIn(sc))||'')+'</p>'+
    (mine?'<button type="button" class="tlink small" data-act="grid-pick">View another grid</button>':'<button type="button" class="tlink small" data-act="pick-grid" data-v="'+myCell()+'">Back to your grid</button>')+'</div></div>'+
    '<div class="stats gstats"><button type="button" class="stat" data-act="car" data-v="plat" data-id="3"><b>'+(isProv?Object.keys(S.members).length:(counts[sc]||0)).toLocaleString()+'</b><span>'+((isProv?Object.keys(S.members).length:(counts[sc]||0))===1?'Member':'Members')+'</span></button>'+
    '<button type="button" class="stat" data-act="car" data-v="plat" data-id="0"><b>'+n("principle")+'<small>/10</small></b><span>Principles</span></button>'+
    '<button type="button" class="stat'+(open.length?' good':'')+'" data-act="grid-votes" data-v="'+sc+'"><b>'+open.length+'</b><span>Open vote'+(open.length===1?'':'s')+'</span></button></div>'+latest;
  const teamsHere=isProv?[]:Object.values(teams()).filter(o=>o.cell===sc);
  const card=isProv?'<div class="card gridcard"><h2>All of BC</h2><div class="kv" style="margin-top:6px"><span>Members</span><span>'+Object.keys(S.members).length+'</span></div><div class="kv"><span>Grids with members</span><span>'+Object.keys(counts).length+'</span></div><div class="kv"><span>Principles adopted</span><span>'+n("principle")+' / 10</span></div><p class="muted small" style="margin:8px 0 0">Items reach BC only after a grid adopts them, votes to send them, and most grids agree.</p></div>'
    :gridCard(sc,{mine,members:counts[sc]||0,prin:n("principle"),pol:n("policy"),plan:n("plan"),teams:teamsHere.filter(o=>!o.closedAt).length});
  const openNote=kind=>{const open=openOf(kind,level,cell).length;return open?'<button type="button" class="note" style="text-align:left" data-act="all-votes">'+open+' '+(open===1?KIND_ONE[kind]+' vote is':KIND_ONE[kind]+' votes are')+' open now →</button>':''};
  const hist=kind=>'<button type="button" class="btn small-btn ghostish" data-act="open-hist" data-v="'+kind+'" data-id="'+level+'" data-cell="'+(cell||"")+'">History</button>';
  const o=peOpts();const items=peItems();
  const L=items.length;const amendHelp=L===0?'Tap slot 1 to propose your grid\'s first principle.':L===1?'Tap an empty slot to add one. ✎ rewords it, ✕ removes it.':L>=10?'The list is full. ✎ rewords, ✕ removes, drag ⠿ to move.':(isTouch()?'Tap a + to add one there.':'Hover between two principles to add one there.')+' ✎ rewords, ✕ removes, drag ⠿ to move.';
  const forming=mine&&!isProv&&gridSize(sc)<MIN_GRID&&!BETA_WAIVE?'<div class="note">Your grid needs '+MIN_GRID+' members before it can vote on its own principles. It has '+gridSize(sc)+' so far.</div>':'';
  const prin=forming+'<div class="secthd prinhd"><span class="muted small">'+items.length+' of 10</span><span class="prinact">'+'<button type="button" class="tlink small plain" data-act="open-hist" data-v="principle" data-id="'+level+'" data-cell="'+(cell||"")+'">History</button>'+(peAllowed()?'<button type="button" class="tlink small plain" data-act="amend">'+(S.ui.amend?'Done amending':'Amend')+'</button>':'')+'</span></div>'+((S.ui.amend||!L)&&peAllowed()&&!(S.ui.pe&&S.ui.pe.mode)?'<p class="muted small" style="margin:0">'+amendHelp+'</p>':'')+
    plList(items,S.ui.pe||{},o);
  const other=kind=>{const sl=seated(kind,level,cell),ks=Object.keys(sl).map(Number).sort((a,b)=>a-b);
    const rows=ks.map(k=>{const it=sl[k];return '<button type="button" class="li" data-act="open-item" data-v="'+it.id+'"><span class="num">'+k+'</span><span class="tx"><span class="t">'+esc(it.title)+'</span><span class="s">'+esc(kind==="plan"?planLinks(it):it.body.slice(0,90)+(it.body.length>90?"…":""))+'</span></span></button>'}).join("");
    return '<p class="muted small" style="margin:0">'+ks.length+' of '+CAP[kind]+'</p>'+(rows?'<div class="list">'+rows+'</div>':'<div class="card empty">None adopted yet.</div>')+openNote(kind)+
      '<div class="pactions">'+(mine?'<button type="button" class="btn small-btn" data-act="propose" data-v="'+kind+'" '+(S.readOnly||me().inBox?'disabled':'')+'>+ Propose a '+KIND_ONE[kind]+'</button>':'')+hist(kind)+'</div>'};
  const members=isProv?'<p class="muted small" style="margin:0">Members belong to a grid. Tap one on the map to see who\'s in it.</p>':(counts[sc]?'<div class="list">'+memberRows(sc)+'</div>':'<div class="card empty">No members here yet.</div>');
  const act=teamsHere.filter(o=>!o.closedAt),cl=teamsHere.filter(o=>o.closedAt);
  const teamP=isProv?'<p class="muted small" style="margin:0">Teams belong to a grid. Tap one on the map.</p>':(act.length?'<div class="list">'+act.map(teamRow).join("")+'</div>':'<div class="card empty">No teams yet.</div>')+(cl.length?'<div class="secthd"><h2>Closed</h2></div><div class="list">'+cl.map(teamRow).join("")+'</div>':'')+(mine?'<div class="pactions"><button type="button" class="btn small-btn" data-act="tab" data-v="teams">Go to Teams ›</button></div>':'');
  return head+(mine?blockedNote():'')+carousel("plat",["Principles <span class=\"tcount\">"+items.length+"</span>","Workshops","Roles","Members"+(isProv?"":" <span class=\"tcount\">"+(counts[sc]||0)+"</span>")],[prin,soonPanel("workshops"),soonPanel("roles"),members]);
}
function pendingMine(sc,isProv){if(S.ui.pe&&S.ui.pe.mode)return '';const mineOpen=Object.values(S.items).filter(it=>it.kind==="principle"&&it.by===S.me&&!isClosed(it)&&!isVoid(it)&&(isProv?it.level==="prov":it.level!=="prov"&&it.cell===sc)).sort((a,b)=>b.at-a.at);
  return mineOpen.map(it=>'<div class="prcpt1" role="status"><span>✓ Proposed: '+esc(pastAction(prinAction(it)).replace(/^\w+/,w=>w))+' · '+tstamp(new Date(it.at),true)+(sending(it)?' · sending…':'')+'. <button type="button" class="tlink small plain" data-act="open-item" data-v="'+it.id+'">View its vote ›</button></span></div>').join("")}
// Workshops and Roles: placeholders during the beta, to hear from members before building them
function soonPanel(k){const W=k==="workshops";
  const pts=W?[["Work out a change together","For example, repealing a bad set of taxes: members write the change as a shared document, fix its problems and get it ready for a vote."],
      ["Every edit on the record","The draft keeps a full history of changes, so anyone can see who changed what, and why."],
      ["Open to anyone","Anyone can start a workshop or join one. A volunteer lead keeps it moving. No elections, and no lawyers, accountants or staffers needed."]]:
    [["Jobs someone has to own","Door knocking, community outreach, events, print material such as signs, rack cards and ads."],
      ["Proposed by members","Members propose a role. Then anyone can stand for it, and the grid elects someone."],
      ["Answerable to the grid","Only the members who elected someone can recall them."]];
  return '<div class="card stack soon"><span class="chip warn" style="align-self:flex-start">Coming later</span><h2>'+(W?'Workshops':'Roles')+'</h2>'+
    '<p class="muted" style="margin:0">'+(W?'A place for members to work out the details of a change together, before it goes to a vote.':'Elected positions for the work every party needs done.')+'</p>'+
    '<div class="soonpts">'+pts.map(x=>'<div><b>'+x[0]+'</b><span>'+x[1]+'</span></div>').join("")+'</div>'+
    '<p class="small" style="margin:0">We&#39;re thinking about building this, and we want to hear from members first, during the beta. What would you use it for?</p>'+
    '<button type="button" class="btn block" data-act="feedback" data-v="'+k+'">Tell us what you think</button></div>'}
// Feedback: kept privately by citizensparty.ca (POST /api/feedback), never on the public record
const FEEDBACK_URL=((window.CP_BUILD&&window.CP_BUILD.directory)||"").replace(/\/$/,"")+"/api/feedback";
function feedbackView(v){const about=v.about==="workshops"?"Workshops":v.about==="roles"?"Roles":"";
  return backBtn+'<h1 style="margin:0">Send feedback</h1><p class="lede" style="margin:0">'+(about?'What would you use '+about+' for? What should it do?':'What&#39;s confusing, what&#39;s missing, what you&#39;d change.')+' Every message is read, and none of it goes on the public record.</p>'+
    '<label class="f" for="fb-msg">Your feedback<textarea class="inp" id="fb-msg" rows="5" maxlength="5000" placeholder="What should we change?"></textarea></label>'+
    '<label class="f" for="fb-email">Email, if you&#39;d like a reply <span class="muted">(optional)</span><input class="inp" id="fb-email" type="email" maxlength="200" autocomplete="email"></label>'+
    '<p class="small" id="fb-st" role="status" style="margin:0"></p><button type="button" class="btn pri block" data-act="fb-send" id="fb-go">Send feedback</button>'+
    '<p class="small muted" style="margin:0">Or email <b>admin@citizensparty.ca</b>.</p>'}
async function sendFeedback(){const msg=(val("fb-msg")||"").trim(),st=$("#fb-st"),go=$("#fb-go");const v=S.ui.view||{};
  if(msg.length<3){st.className="small kvn";st.textContent="Write a few words first.";return}
  go.disabled=true;st.className="small muted";st.textContent="Sending…";
  try{const r=await fetch(FEEDBACK_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:msg,email:val("fb-email")||"",page:"app"+(v.about?"/"+v.about:"")})});const j=await r.json();
    if(j&&j.ok){done();toast("Thanks! We got it.");return}go.disabled=false;st.className="small kvn";st.textContent=(j&&j.why)||"That didn't send. Try again."}
  catch(e){go.disabled=false;st.className="small kvn";st.textContent="That didn't send. Check your connection, or email admin@citizensparty.ca."}}
function scopePickView(){
  const counts=cellCounts();const cur=platScope();
  const grids=[...new Set(Object.values(S.members).map(m=>m.cell))].sort((a,b)=>(b===myCell())-(a===myCell())||(counts[b]||0)-(counts[a]||0));
  const row=(v,title,sub)=>'<button type="button" class="li" data-act="set-scope" data-v="'+v+'"><span class="tx"><span class="t">'+esc(title)+'</span><span class="s">'+esc(sub)+'</span></span>'+(cur===v?'<span class="chip acc">Showing</span>':'')+'<span class="chev">›</span></button>';
  return backBtn+'<h1>Choose a grid</h1><p class="lede">See what any grid has adopted. Tap a square on the map or pick from the list.</p>'+
  '<div class="list">'+row("prov","All of BC","Adopted province-wide")+'</div>'+
  bcMap(id=>counts[id]?{cls:"f-mem",label:counts[id]}:null,{click:"set-scope",sel:cur==="prov"?null:cur})+
  '<div class="secthd"><h2>Grids with members</h2><span class="muted">'+grids.length+'</span></div><div class="list">'+grids.map(g=>row(g,gridFull(g)+(g===myCell()?" (yours)":""),(counts[g]||0)+" members · "+Object.keys(seated("principle","cell",g)).length+" principles"+(townsIn(g).length?" · "+townsIn(g).slice(0,3).join(", "):""))).join("")+'</div>';
}
function planLinks(it){const l=(it.links||[]).map(id=>S.items[id]).filter(Boolean);return l.length?"Delivers: "+l.map(x=>x.title).join(" · "):"No linked policy"}
// versions of a principle list: replays every passed change in order (same rules as seated())
function prinVersions(level,cell){
  const done=Object.values(S.items).filter(i=>scopeMatch(i,"principle",level,cell)&&effective(i)).sort((a,b)=>decidedAt(a)-decidedAt(b)||a.at-b.at);
  const list=[],out=[];
  for(const it of done){const prev=list.slice();let ch;
    if(it.removes){const i=list.findIndex(x=>x.id===it.removes);if(i<0)continue;list.splice(i,1);ch={type:"remove",i,old:prev[i]}}
    else if(it.moves){const i=list.findIndex(x=>x.id===it.moves);if(i<0)continue;const x=list.splice(i,1)[0];const j=Math.min(Math.max(0,(it.to||1)-1),list.length);list.splice(j,0,x);ch={type:"move",from:i,i:j,old:x}}
    else{const i=it.replaces?list.findIndex(x=>x.id===it.replaces):-1;
      if(i>=0){list[i]=it;ch={type:"reword",i,old:prev[i]}}
      else{if(list.length>=CAP.principle)continue;const pos=it.pos?Math.min(Math.max(0,it.pos-1),list.length):it.slot?Math.min(it.slot-1,list.length):list.length;list.splice(pos,0,it);ch={type:"add",i:pos}}}
    out.push(Object.assign(ch,{it,list:list.slice()}))}
  return out}
function verRows(v){const F=!!v.future;
  const row=(n,text,cls,tag)=>'<div class="prow'+(cls?' '+cls:'')+'"><span class="pn">'+n+'</span><span class="pt">'+(cls==="vdel"?'<s>'+esc(text)+'</s>':esc(text))+'</span>'+(tag?'<span class="vtag">'+tag+'</span>':'')+'</div>';
  let rows='';const L=v.list;const ins=v.type==="add"&&v.i<L.length-1;
  const ghostAt=v.type==="move"?(v.from<v.i?v.from:v.from+1):-1;
  for(let i=0;i<=L.length;i++){
    if(v.type==="remove"&&i===v.i)rows+=row("",v.old.text,"vdel",F?"Remove":"Removed");
    const dir=v.type==="move"?(v.i>v.from?"down":"up"):"";
    if(v.type==="move"&&i===ghostAt)rows+=row("",v.old.text,"vdel",F?"Remove from here":"Moved from here");
    if(i===L.length)break;const it=L[i];
    if(v.type==="reword"&&i===v.i)rows+=row(i+1,v.old.text,"vdel",F?"Replace":"Replaced")+row(i+1,it.text,"vadd",F?"Replace":"Replaced");
    else if(v.type==="add"&&i===v.i)rows+=row(i+1,it.text,"vadd",ins?(F?"Insert":"Inserted"):(F?"Add":"Added"));
    else if(v.type==="move"&&i===v.i)rows+=row(i+1,it.text,"vadd",F?"Move "+dir:"Moved "+dir);
    else rows+=row(i+1,it.text,"","")
  }
  return rows}
function changeV(texts,c){const L=texts.slice();let v;
  if(c.kind==="add"){const i=Math.min(Math.max(0,(c.at||L.length+1)-1),L.length);L.splice(i,0,c.text);v={type:"add",i}}
  else if(c.kind==="reword"){const old=L[c.n-1];L[c.n-1]=c.text;v={type:"reword",i:c.n-1,old:{text:old}}}
  else if(c.kind==="remove"){const old=L.splice(c.n-1,1)[0];v={type:"remove",i:c.n-1,old:{text:old}}}
  else{const x=L.splice(c.n-1,1)[0];const j=Math.min(c.to-1,L.length);L.splice(j,0,x);v={type:"move",from:c.n-1,i:j,old:{text:x}}}
  v.list=L.map(t=>({text:t}));v.future=true;return v}
function gridLink(target,label){return '<button type="button" class="tlink plain glink" data-act="goto-grid" data-v="'+target+'">'+esc(label)+'</button>'}
const ACT_WORDS={Add:"New principle",Replace:"Reword principle",Delete:"Remove principle",Move:"Move principle","Send to BC":"Send a principle to BC"};
function chipHead(act,scope,status,target){const w=ACT_WORDS[act]||act;return '<div class="vhead"><span class="vctx">'+(scope?(target?gridLink(target,scope):esc(scope))+' · ':'')+esc(w)+'</span>'+(status||'')+'</div>'}
function detailCard(rows){return '<div class="card wc"><div class="wch">Details</div>'+rows.filter(Boolean).map(r=>'<div class="kv"><span>'+r[0]+'</span><span>'+r[1]+'</span></div>').join("")+'</div>'}
function earlyAt(it){const t=tally(it);const ts=ballotsOf(it).filter(b=>b.v==="y").map(b=>b.t).sort((a,b)=>a-b);const k=Math.floor(t.eligible/2);const x=ts.length>k?ts[k]:null;return x!=null&&x<it.closes?x:null}
function cardHead(a,g){return '<div class="chead"><span class="cact">'+esc(a)+'</span>'+(g?' · <span>'+esc(g)+'</span>':'')+'</div>'}
function kbadge(t){return '<div class="kbadge">'+esc(t)+'</div>'}
function prinAction(it){seated(it.kind,it.level,it.cell);const n=id=>{const x=S.items[id];return x&&seatOf(x)?" #"+seatOf(x):""};
  if(it.removes)return "Remove a principle";if(it.moves){const x=S.items[it.moves];const f=x&&seatOf(x);if(f&&it.to){const d=it.to-f;return "Move a principle "+(d<0?"up ":"down ")+Math.abs(d)+(Math.abs(d)===1?" place":" places")}return "Move a principle"}if(it.replaces)return "Reword a principle";if(it.pos)return "Insert a principle";return "Add a principle"}
function routeLine(cell){return '<p class="route">'+gridLink(cell,gridName(cell))+'<span aria-hidden="true">→</span>'+gridLink("prov","All of BC")+'</p>'}
function bcListHead(){const n=Object.keys(seated("principle","prov",null)).length;return '<div class="lhead"><span class="lmini">'+bcMap(id=>cellCounts()[id]?{cls:"f-mem"}:null,{noMe:true})+'</span><b>All of BC</b><span class="muted small">'+n+' of 10 principles now</span></div>'}
function gridListHead(cell,txt){return '<div class="lhead"><span class="lmini">'+bcMap(id=>id===cell?{cls:"f-pick"}:null,{noMe:true})+'</span><b>'+esc(gridName(cell))+'</b><span class="muted small">'+txt+'</span></div>'}
function listHead(level,cell,txt){if(level==="prov"){if(!txt)return bcListHead();return '<div class="lhead"><span class="lmini">'+bcMap(id=>cellCounts()[id]?{cls:"f-mem"}:null,{noMe:true})+'</span><b>All of BC</b><span class="muted small">'+txt+'</span></div>'}return cell?gridListHead(cell,txt||''):'<div class="wch">Principles</div>'}
function changeBox(v,lab,level,cell,txt){return '<div class="card wc plbox">'+listHead(level,cell,txt)+'<div class="plist compact">'+verRows(v)+'</div></div>'}
function pastAction(t){return t.replace(/^(Add|Insert|Reword|Remove|Move)\b/,m=>({Add:"Added",Insert:"Inserted",Reword:"Reworded",Remove:"Removed",Move:"Moved"})[m])}
function itemChange(it){if(it.kind!=="principle")return "";let ids;let note="";
  if(isVoid(it)){ids=listBefore(voidCause(it),it);note=" (voided)"}
  else if(isClosed(it)||effective(it)){const vs=prinVersions(it.level,it.cell);const vi=vs.findIndex(v=>v.it.id===it.id);
    if(vi>=0)return '<div class="card wc plbox">'+listHead(it.level,it.cell,vs[vi].list.length+' of 10 · '+fshort(decidedAt(it)))+'<div class="plist compact">'+verRows(vs[vi])+'</div></div>';
    const before=vs.filter(v=>v.it.closes<it.closes||(v.it.closes===it.closes&&v.it.at<it.at));ids=before.length?before[before.length-1].list:[];note=" (not adopted)"}
  else{const sl=seated("principle",it.level,it.cell);ids=Object.keys(sl).map(Number).sort((a,b)=>a-b).map(k=>sl[k])}
  const texts=ids.map(x=>x.text);const idx=id=>ids.findIndex(x=>x.id===id)+1;
  let c;if(it.removes){const n=idx(it.removes);if(!n)return "";c={kind:"remove",n}}else if(it.moves){const n=idx(it.moves);if(!n)return "";c={kind:"move",n,to:it.to}}else if(it.replaces){const n=idx(it.replaces);if(!n)return "";c={kind:"reword",n,text:it.text}}else{if(texts.length>=CAP.principle&&!note)return "";c={kind:"add",at:it.pos||texts.length+1,text:it.text}}
  return changeBox(changeV(texts,c),prinAction(it)+note,it.level,it.cell,ids.length+' of 10 '+(note?'· '+fshort(it.closes):'principles now'))}
// History: every version side by side in a row that scrolls sideways and snaps to one version, newest first.
// Swipe left for older, right for newer; the next version slides in as the current one slides out.
function verBlock(vs,k,o){const n=vs.length;
  const nb=(d,lab,on,id)=>'<button type="button" class="btn small-btn'+(o.hint&&on&&d===k-1?' cue':'')+'" id="'+id+'" data-act="'+o.act+'" data-v="'+(o.prefix||'')+d+'" '+(on?'':'disabled')+'>'+lab+'</button>';
  let pages='';for(let i=n-1;i>=0;i--){const v=vs[i];pages+='<section class="vpanel" data-i="'+i+'"><div class="vmeta">'+o.meta(v,i)+'</div><div class="card wc plbox">'+(o.head?o.head(v,i):'')+'<div class="plist compact readmode versions">'+verRows(v)+'</div></div></section>'}
  return '<div class="vnav">'+nb(k+1,'‹ Newer',k<n-1,"vnewer")+'<span id="vlabel"><b>Version '+(k+1)+'</b> of '+n+'</span>'+nb(k-1,'Older ›',k>0,"volder")+'</div>'+
  '<div class="vcar" id="vpage" data-k="'+k+'" data-n="'+n+'" data-ns="'+o.ns+'">'+pages+'</div>';
}
function versionsView(level,cell){
  const vs=prinVersions(level,cell);if(!vs.length)return '<div class="card empty">No principles adopted yet.</div>';
  const k=S.ui.hv==null?vs.length-1:Math.max(0,Math.min(S.ui.hv,vs.length-1));
  const what=v=>v.type==="add"?(v.i<v.list.length-1?'Inserted at #'+(v.i+1):'Added as #'+(v.i+1)):v.type==="reword"?'Replaced #'+(v.i+1):v.type==="remove"?'Removed #'+(v.i+1):v.type==="move"?'Moved #'+(v.from+1)+' → #'+(v.i+1):'Changed';
  return verBlock(vs,k,{act:"hv",ns:"app",head:(v,kk)=>listHead(level,cell,v.list.length+' of 10 · '+(kk===vs.length-1?'Current':fshort(decidedAt(v.it)))),
    meta:v=>{const t=tally(v.it);return '<span class="muted small">'+what(v)+' · passed '+t.y+'–'+t.n+'</span><button type="button" class="tlink small" data-act="open-item" data-v="'+v.it.id+'">See the vote ›</button>'}});
}
// the practice grid's history, built from the same steps the tour walked through
function tourVersions(){if(tourVersions.c)return tourVersions.c;const out=[];let list=[];const day=864e5;let t=Date.now()-66*day;
  const push=(ch,y,n)=>{t+=5*day;out.push(Object.assign(ch,{list:list.map(x=>({text:x})),y,n,at:t}))};
  list=[tFirst()];push({type:"add",i:0},5940,2710);
  T_PRIN.forEach((p,j)=>{list.splice(1+j,0,p);push({type:"add",i:1+j},4000+(j*733)%3000,1500+(j*577)%2000)});
  list.splice(3,0,T_INSERT);push({type:"add",i:3},6102,3377);
  const old=list[6];list[6]="Taxes should be low, simple and fair.";push({type:"reword",i:6,old:{text:old}},7311,2105);
  const mv=list.splice(2,1)[0];list.splice(6,0,mv);push({type:"move",from:2,i:6,old:{text:mv}},5520,4012);
  const rm=list[8];list.splice(8,1);push({type:"remove",i:8,old:{text:rm}},8800,1210);
  return tourVersions.c=out}
function reducedMotion(){try{return matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){return false}}
function verApply(el,nk){if(el&&el.dataset.ns==="tour"){const st=tx();if(nk<(st.k==null?tourVersions().length-1:st.k))st.older=true;st.k=nk}else S.ui.hv=nk}
// Older / Newer: slide the row to that version; the scroll handler then records it
function verGo(nk,cur,apply){const el=document.getElementById("vpage");const n=el?+el.dataset.n:0;
  if(!el||nk<0||nk>=n){apply();render();return}
  el.scrollTo({left:(n-1-nk)*el.clientWidth,behavior:reducedMotion()?"auto":"smooth"})}
function verFit(el,i){const p=el.children[i];if(p)el.style.height=p.offsetHeight+"px"}
function setupVerSwipe(){const el=document.getElementById("vpage");if(!el)return;const n=+el.dataset.n,k=+el.dataset.k;
  el.scrollLeft=(n-1-k)*el.clientWidth;verFit(el,n-1-k);let t=null;
  el.addEventListener("scroll",()=>{const idx=Math.round(el.scrollLeft/Math.max(1,el.clientWidth));const nk=n-1-idx;
    // the label and buttons follow the swipe right away; the page catches up once it settles
    const lb=document.getElementById("vlabel");if(lb)lb.innerHTML='<b>Version '+(nk+1)+'</b> of '+n;
    const a=document.getElementById("vnewer"),b=document.getElementById("volder");if(a)a.disabled=nk>=n-1;if(b)b.disabled=nk<=0;if(a)a.dataset.v=a.dataset.v.replace(/-?\d+$/,String(nk+1));if(b)b.dataset.v=b.dataset.v.replace(/-?\d+$/,String(nk-1));
    clearTimeout(t);t=setTimeout(()=>{verFit(el,idx);if(nk!==+el.dataset.k){el.dataset.k=nk;verApply(el,nk);render()}},140)},{passive:true})}
function historyView(kind,level,cellArg){
  if(kind==="principle"&&S.ui.hmode!=="votes"){const cell=level==="prov"?null:(cellArg||myCell());
    return backBtn+'<div><h1>Principles: history</h1></div>'+seg("hmode",[["versions","Versions"],["votes","All votes"]],"versions")+versionsView(level,cell)}
  return historyViewVotes(kind,level,cellArg)}
function historyViewVotes(kind,level,cellArg){
  const cell=level==="prov"?null:(cellArg||myCell());const past=pastOf(kind,level,cell);
  const rows=kind==="principle"?past.map(it=>prinRow(it)).join(""):past.map(it=>{seated(it.kind,it.level,it.cell);const t=tally(it);const k=ASG[it.id];let lab,cls;
    if(!t.pass){lab="Rejected";cls="no"}else if(EFF[it.id]==="void"){lab="No effect";cls=""}else if(it.removes){lab="Removed";cls="acc"}else if(it.moves){lab="Moved to #"+it.to;cls="acc"}else if(it.replaces&&S.items[it.replaces]&&replacedBy(S.items[it.replaces])===it){lab="Replaced #"+k;cls="acc"}else{lab="Added as #"+k;cls="yes"}
    return '<button type="button" class="li" data-act="open-item" data-v="'+it.id+'"><span class="tx"><span class="s" style="margin:0 0 2px">'+fdate(it.closes)+' · '+(t.voters<t.min?'too few votes':t.y+' yes, '+t.n+' no')+(t.pass&&!seatOf(it)?' · later replaced':'')+'</span><span class="t">'+esc(itemTitle(it))+'</span>'+(it.replaces&&t.pass&&S.items[it.replaces]?'<span class="s">Replaced: '+esc(itemTitle(S.items[it.replaces]))+'</span>':'')+'</span><span class="chip '+cls+'">'+lab+'</span></button>'}).join("");
  return backBtn+'<div><h1>'+KIND_PL[kind]+': history</h1>'+(kind==="principle"?seg("hmode",[["versions","Versions"],["votes","All votes"]],"votes"):'')+'<p class="lede" style="margin-top:12px">Every vote that changed, or tried to change, '+(level==="prov"?'BC\'s':esc(gridName(cell))+'\'s')+' list. Newest first.</p></div>'+(rows?'<div class="'+(kind==="principle"?'vlist':'list')+'">'+rows+'</div>':'<div class="card empty">No votes have closed yet.</div>');
}

// ---------- TEAMS tab ----------
function teamsView(){
  const cell=myCell();const all=Object.values(teams()).filter(o=>o.cell===cell);
  const active=all.filter(o=>!o.closedAt).sort((a,b)=>a.start-b.start),closed=all.filter(o=>o.closedAt).sort((a,b)=>b.closedAt-a.closedAt);
  const pendingNew=Object.values(S.items).filter(i=>i.kind==="office"&&i.act==="create"&&i.cell===cell&&!isClosed(i));
  return '<div><h1>Teams in '+gridName(cell)+'</h1><p class="lede" style="margin-top:4px">Teams do the grid\'s work: marketing, door knocking, admin. The grid votes to create, rename or close a team, and elects each team\'s lead.</p></div>'+
  (active.length?'<div class="list">'+active.map(o=>{const lh=leadHistory(o);const el=openElection(o.id);let sub,chip;
    if(lh.lead){sub="Lead: "+nameOf(lh.lead);chip='<span class="chip yes">Led</span>'}else if(el){sub="Lead election open · "+left(el.closes-now());chip='<span class="chip warn">Electing</span>'}else{sub="No lead";chip='<span class="chip no">Vacant</span>'}
    return '<button type="button" class="li" data-act="open-team" data-v="'+o.id+'"><span class="tx"><span class="t">'+esc(o.name)+'</span><span class="s">'+esc(sub)+'</span></span>'+chip+'<span class="chev">›</span></button>'}).join("")+'</div>':'<div class="card empty">No teams yet.</div>')+
  (pendingNew.length?'<div class="note">'+pendingNew.map(i=>'Being voted on: <b>'+esc(i.name)+'</b>').join("<br>")+'. See the Vote tab.</div>':'')+
  blockedNote()+
  '<button type="button" class="btn pri block" data-act="team-form" data-v="create" '+(S.readOnly||me().inBox?'disabled':'')+'>Propose a new team</button>'+
  (closed.length?'<div class="secthd"><h2>Closed teams</h2><span class="muted">'+closed.length+'</span></div><div class="list">'+closed.map(o=>'<button type="button" class="li" data-act="open-team" data-v="'+o.id+'"><span class="tx"><span class="t">'+esc(o.name)+'</span><span class="s">'+fdate(o.start)+' – '+fdate(o.closedAt)+'</span></span><span class="chip">Closed</span><span class="chev">›</span></button>').join("")+'</div>':'');
}
function teamView(o){
  const lh=leadHistory(o);const inCell=myCell()===o.cell;const active=!o.closedAt;const e=me();
  const el=openElection(o.id);const els=electionsOf(o.id);const lastEl=els.filter(isClosed).slice(-1)[0];
  const openOf_=act=>Object.values(S.items).find(i=>i.kind==="office"&&i.act===act&&i.office===o.id&&!isClosed(i));
  const openRecall=openOf_("recall"),openClose=openOf_("close"),openRename=openOf_("rename");
  const pending=[openRecall,openClose,openRename].filter(Boolean);
  let lead='<div class="card stack"><div class="secthd"><h2>Lead</h2>'+(el?'<span class="chip warn">Election open</span>':'')+'</div>';
  if(!active)lead+='<p class="muted" style="margin:0">Team closed on '+dot(fdate(o.closedAt))+'</p>';
  else if(lh.lead)lead+='<div class="cand" style="border:0;padding:0">'+avatar(lh.lead,44)+'<div class="tx"><div style="font-weight:700;font-size:16px">'+esc(nameOf(lh.lead))+(lh.lead===S.me?' (you)':'')+'</div><div class="muted">Since '+fdate(lh.since)+'</div></div></div>';
  else if(el){const cands=electionCands(el);const amCand=cands.includes(S.me);
    lead+=(cands.length?'<div>'+cands.map(id=>'<div class="cand">'+avatar(id)+'<div class="tx" style="font-weight:700">'+esc(nameOf(id))+(id===S.me?' (you)':'')+'</div></div>').join("")+'</div>':'<p class="muted" style="margin:0">Nobody is running yet.</p>')+
    '<button type="button" class="btn pri block" data-act="open-item" data-v="'+el.id+'">'+(myVote(el.id)!=null?'See the election':'Vote in the election')+' · '+left(el.closes-now())+'</button>'+
    (inCell&&!(el.only&&el.only.length)&&!e.inBox?'<button type="button" class="btn block" data-act="stand" data-id="'+el.id+'" '+(S.readOnly?'disabled':'')+'>'+(amCand?'Withdraw my candidacy':'Run for lead')+'</button>':'')+
    (S.isOwner&&DEMO()?'<button type="button" class="btn ghost" data-act="end-now" data-id="'+el.id+'">Owner test tool: end this election now</button>':'')}
  else{let runoff=null,msg="Nobody leads this team.";
    if(lastEl){const t=tally(lastEl);if(!t.winner&&t.rank.length>=2&&(t.counts[t.rank[1]]||0)>0&&t.total>=S.cfg.minVoters){runoff=t.rank.slice(0,2);msg="No majority last time: "+nameOf(runoff[0])+" vs "+nameOf(runoff[1])+" can go to a runoff."}}
    lead+='<p class="muted" style="margin:0">'+esc(msg)+'</p>'+(inCell&&!e.inBox?(runoff?'<button type="button" class="btn pri block" data-act="start-election" data-id="'+o.id+'" data-v="'+runoff.join(",")+'">Start the runoff</button>':'<button type="button" class="btn pri block" data-act="start-election" data-id="'+o.id+'" '+(S.readOnly?'disabled':'')+'>Start a lead election</button>'):'')}
  lead+='</div>';
  const pend=pending.length?'<div class="list">'+pending.map(i=>'<button type="button" class="li" data-act="open-item" data-v="'+i.id+'"><span class="tx"><span class="t">'+esc(itemTitle(i))+'</span><span class="s">Being voted on · '+left(i.closes-now())+'</span></span>'+myChip(i)+'<span class="chev">›</span></button>').join("")+'</div>':'';
  const hist=lh.segs.slice().reverse();
  const ms=((S.odocs[o.id]&&S.odocs[o.id].meetings)||[]).slice().sort((a,b)=>b.date-a.date);
  const motions=Object.values(S.items).filter(i=>i.kind==="office"&&(i.office===o.id||i.id===o.id)).sort((a,b)=>b.at-a.at);
  let acts="";
  if(active&&inCell&&!e.inBox){
    if(lh.lead&&lh.lead!==S.me&&!openRecall)acts+='<button type="button" class="btn block" data-act="team-form" data-v="recall" data-id="'+o.id+'">Propose recalling the lead</button>';
    if(lh.lead===S.me)acts+='<button type="button" class="btn block" data-act="meeting-form" data-id="'+o.id+'">Add a meeting recording</button><button type="button" class="btn block danger" data-act="resign" data-id="'+o.id+'">Step down as lead</button>';
    if(!openRename)acts+='<button type="button" class="btn block" data-act="team-form" data-v="rename" data-id="'+o.id+'">Propose a new name</button>';
    if(!openClose)acts+='<button type="button" class="btn block danger" data-act="team-form" data-v="close" data-id="'+o.id+'">Propose closing the team</button>';
  }
  return backBtn+'<div class="eyebrow">Team · '+esc(gridName(o.cell))+(active?'':' · closed')+'</div><h1>'+esc(o.name)+'</h1>'+(o.purpose?'<p class="lede">'+esc(o.purpose)+'</p>':'')+
  lead+pend+
  '<div class="card"><div class="secthd"><h2>Leads over time</h2></div>'+(hist.length?hist.map(s=>'<div class="tl"><span class="d">'+fdate(s.from)+' – '+(s.to?fdate(s.to):'now')+'</span><span><b>'+esc(nameOf(s.lead))+'</b>'+(s.end?' <span class="muted">· '+esc(s.end.toLowerCase())+'</span>':'')+'</span></div>').join(""):'<p class="muted" style="margin:6px 0 0">Nobody yet.</p>')+'</div>'+
  '<div class="card"><div class="secthd"><h2>Meeting recordings</h2>'+(active&&lh.lead&&staleMeeting(o)?'<span class="chip warn">None in 3 months</span>':'')+'</div>'+(ms.length?ms.map(x=>'<div class="kv"><span>'+fdate(x.date)+'</span><span><a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">Watch ↗</a></span></div>').join(""):'<p class="muted" style="margin:6px 0 0">None yet.</p>')+'</div>'+
  (acts||motions.length?'<details class="more"><summary>⋯ More actions</summary><div class="stack" style="margin-top:10px">'+acts+
    (o.names.length>1?'<p class="muted" style="margin:0">Formerly: '+esc(o.names.slice(0,-1).map(n=>n.name).join(", "))+'</p>':'')+
    (motions.length?'<div class="list">'+motions.map(i=>{const oc=outcome(i);return '<button type="button" class="li" data-act="open-item" data-v="'+i.id+'"><span class="tx"><span class="t">'+esc(itemTitle(i))+'</span><span class="s">'+fdate(i.at)+'</span></span><span class="chip '+oc.cls+'">'+esc(oc.label)+'</span></button>'}).join("")+'</div>':'')+'</div></details>':'');
}

// ---------- MAP tab ----------
function mapView(){
  const counts=cellCounts();const sel=S.ui.gridSel||myCell();const towns=townsIn(sel);
  return '<div><h1>Map</h1><p class="lede" style="margin-top:4px">Each 100 km square is one grid. Numbers show members. Tap a grid to see who\'s in it.</p></div>'+
  bcMap(id=>counts[id]?{cls:"f-mem",label:counts[id]}:null,{click:"grid-cell",sel})+
  '<div class="legend"><span><i style="background:var(--accent-soft)"></i>Has members</span><span><i style="background:transparent;outline:2px solid var(--ink)"></i>Your grid</span><span><i style="background:var(--accent);opacity:.4"></i>Selected</span></div>'+
  '<div class="card"><h2>'+esc(gridName(sel))+(sel===myCell()?' (yours)':'')+'</h2><div class="kv" style="margin-top:6px"><span>Members</span><span>'+(counts[sel]||0)+'</span></div><div class="kv"><span>Principles adopted</span><span>'+Object.keys(seated("principle","cell",sel)).length+' / 10</span></div><p class="muted" style="margin:8px 0 0">'+(towns.length?'Includes '+esc(towns.join(", ")):'No listed towns')+'</p></div>'+
  (counts[sel]?'<div class="secthd"><h2>Members</h2><span class="muted">tap for their record</span></div><div class="list">'+memberRows(sel)+'</div>':'');
}
function memberRows(cell){const ids=Object.keys(S.members).filter(id=>S.members[id].cell===cell);ids.sort((a,b)=>(a===S.me?-1:b===S.me?1:0)||nameOf(a).localeCompare(nameOf(b)));return ids.map(id=>{const r=engine(id);return '<button type="button" class="li" data-act="open-member" data-v="'+id+'">'+avatar(id)+'<span class="tx"><span class="t">'+esc(nameOf(id))+(id===S.me&&nameOf(id)!=="You"?' (you)':'')+'</span><span class="s">Joined '+fdate(S.members[id].joinedAt)+'</span></span>'+(r.inBox?'<span class="chip '+(r.why==="new"?"":"no")+'">'+boxLabel(r)+'</span>':'')+'<span class="chev">›</span></button>'}).join("")}
function scorecard(uid){const MV=memberVotes(uid);
  const r=engine(uid);const m=r.m;const self=uid===S.me;const pct=r.total?Math.round(r.voteCount/r.total*100):0;
  const leads=Object.values(teams()).filter(o=>!o.closedAt&&leadHistory(o).lead===uid).map(o=>o.name);
  return '<div class="card stack"><div class="stats"><button type="button" class="stat" data-act="vfilter" data-v="tile-all" data-id="'+uid+'"><b>'+MV.all.length+'</b><span>Grid votes</span></button><button type="button" class="stat good" data-act="vfilter" data-v="tile-voted" data-id="'+uid+'"><b>'+MV.voted.length+'</b><span>Voted</span></button><button type="button" class="stat'+(MV.missedClosed.length?' bad':'')+'" data-act="vfilter" data-v="tile-missed" data-id="'+uid+'"><b>'+MV.missedClosed.length+'</b><span>Missed</span></button></div>'+
  '<div><div class="bar"><b class="y" style="width:'+pct+'%"></b></div><div class="muted" style="margin-top:4px">'+(r.total?pct+'% participation':MV.voted.length?'No votes have closed yet':'No votes yet')+(r.pending.length?' · '+r.pending.length+' open vote'+(r.pending.length===1?'':'s')+' still to cast':'')+'</div></div>'+
  '<div><div class="kv"><span>Grid</span><span>'+gridLink(m.cell,gridName(m.cell))+(m.town&&!gridName(m.cell).startsWith(m.town)?' · '+esc(m.town):'')+'</span></div><div class="kv"><span>Joined</span><span>'+fdate(m.joinedAt)+'</span></div><div class="kv"><span>BC-wide votes (optional)</span><span>'+r.provVoted+' of '+r.provTotal+'</span></div>'+
  (leads.length?'<div class="kv"><span>Leads</span><span>'+esc(leads.join(", "))+'</span></div>':'')+
  (self?'<div class="kv"><span>Your voter code this quarter</span><span class="ledger"><span class="code">'+voterCode(myKey({at:now()}))+'</span></span></div>':'')+'</div></div>'+
  '';
}
function voteOutcome(it){if(it.voided||(it.kind==="principle"&&isVoid(it)))return "void";const t=tally(it);const won=it.kind==="principle"?effective(it):isClosed(it)&&t.pass;
  if(won)return "passed";return isClosed(it)?"failed":"open"}
function memberVotes(uid){const E=engine(uid);const vb=Object.assign({},(S.votes[uid]&&S.votes[uid].b)||{});if(uid===S.me)for(const id in S.items)if(myVote(id)!=null)vb[id]=1;
  const voted=Object.keys(vb).map(id=>S.items[id]).filter(liveItem);
  const not=E.missed.concat(E.boxedOut,E.pending.filter(it=>vb[it.id]==null));
  const noCount=voted.filter(it=>isClosed(it)&&required(it)&&!E.voted.includes(it));
  const all=voted.concat(not.filter(it=>!voted.includes(it))).sort((x,y)=>(y.closes||0)-(x.closes||0));
  return {E,all,voted,not,noCount,missedClosed:not.filter(isClosed)}}
function memberPage(uid){const mine=uid===S.me;
  const props=Object.values(S.items).filter(i=>i.by===uid&&i.kind!=="promote"||(i.kind==="promote"&&i.by===uid)).sort((a,b)=>b.at-a.at);
  const vb=Object.assign({},(S.votes[uid]&&S.votes[uid].b)||{});if(mine)for(const id in S.items)if(myVote(id)!=null)vb[id]=1;
  const voted=Object.keys(vb).map(id=>S.items[id]).filter(Boolean).sort((a,b)=>(b.closes||0)-(a.closes||0));
  const vt={};if(mine)for(const id in vb){const it=S.items[id];const b=it&&ballotsOf(it).find(x=>x.k===myKey(it));if(b)vt[id]=b.t} // when you voted (only your own app knows)
  const pRows=props.length?'<div class="list">'+props.map(it=>{const o=outcome(it);return '<button type="button" class="li" data-act="open-item" data-from="member" data-v="'+it.id+'"><span class="tx"><span class="t">'+esc(itemTitle(it))+'</span><span class="s">'+esc(kindLabel(it))+' · '+fdate(it.at)+'</span></span><span class="chip '+o.cls+'">'+esc(o.label)+'</span></button>'}).join("")+'</div>':'<div class="card empty">No proposals yet.</div>';
  const MV=memberVotes(uid),E=MV.E;
  const cell=S.members[uid].cell;
  const OC={passed:["Passed","yes"],failed:["Rejected","no"],void:["Voided","no"],open:["Open",""]};
  const tags=it=>{const o=OC[voteOutcome(it)]||OC.open;return '<span class="mtags"><span class="mchip '+o[1]+'">'+o[0]+'</span>'+(it.level==="prov"?'<span class="mchip">BC</span>':it.cell!==cell?'<span class="mchip">Previous grid</span>':'')+'</span>'};
  const part=it=>{if(vb[it.id]==null)return E.boxedOut.includes(it)?['In penalty box','no']:isClosed(it)?['Missed','no']:['Not voted yet','warn'];const v=mine?myVote(it.id):null;if(MV.noCount.includes(it))if(it.voided)return mine&&v!=null?[voteText(it,v),v==="y"?'yes':v==="n"?'no':'acc']:['Voted',''];return ["Not counted",''];return mine&&v!=null?[voteText(it,v),v==="y"?'yes':v==="n"?'no':'acc']:['Voted','']};
  const row=it=>{const p=part(it);const nc=MV.noCount.includes(it)&&!it.voided?(E.whyNot[it.id]==="new"?' · new-member cool-down, so it wasn\'t counted':E.whyNot[it.id]==="missed"?' · in the penalty box, so it wasn\'t counted':it.at<E.m.joinedAt?' · opened before joining, so it wasn\'t counted':' · not eligible, so it wasn\'t counted'):'';
    const when=(vb[it.id]!=null&&vt[it.id]?fdt(vt[it.id]):(isClosed(it)?'Ended ':'Closes ')+fdt(it.closes))+nc;
    return '<button type="button" class="li" data-act="open-item" data-from="member" data-v="'+it.id+'"><span class="tx"><span class="t">'+esc(it.kind==="promote"?"Send to BC: "+(it.text||(S.items[it.src]||{}).text||""):itemTitle(it))+'</span><span class="s">'+when+'</span>'+tags(it)+'</span><span class="chip '+p[1]+'">'+esc(p[0])+'</span></button>'};
  const F={all:["All",MV.all],voted:["Voted",MV.voted],missed:["Missed",MV.missedClosed],open:["Open",MV.all.filter(it=>!isClosed(it))]};
  const fk=S.ui.vf&&S.ui.vf.uid===uid&&F[S.ui.vf.v]?S.ui.vf.v:"all";
  const fbar='<div class="vfilt" id="vfilt" role="group" aria-label="Filter votes">'+Object.keys(F).map(k=>'<button type="button" data-act="vfilter" data-v="'+k+'" data-id="'+uid+'" data-stay="1" aria-pressed="'+(k===fk)+'">'+F[k][0]+' <span>'+F[k][1].length+'</span></button>').join("")+'</div>';
  const list=F[fk][1].slice().sort((x,y)=>(y.closes||0)-(x.closes||0));
  const vRows=fbar+(list.length?'<div class="list">'+list.map(row).join("")+'</div>':'<div class="card empty">Nothing here.</div>');
  const note=mine?'':'<p class="muted small" style="margin:0">Votes are secret: you can see that '+esc(nameOf(uid).split(" ")[0])+' took part, not how they voted.</p>';
  const settings=mine?'<div class="card stack"><h2>Feedback</h2><p class="small muted" style="margin:0">Tell us what to improve. It isn&#39;t posted anywhere.</p><button type="button" class="btn block" data-act="feedback">Send feedback</button></div><div class="card stack"><h2>Members you ignore</h2>'+(()=>{const g=Object.keys(ignored()).filter(k=>S.members[k]);return g.length?'<div class="list">'+g.map(k=>'<div class="li"><span class="tx"><span class="t">'+esc(nameOf(k))+'</span><span class="s">'+esc(gridName(S.members[k].cell))+'</span></span><button type="button" class="tlink" data-act="ign" data-v="'+k+'">Stop ignoring</button></div>').join("")+'</div>':'<p class="small muted" style="margin:0">Nobody. To ignore a member who posts too much, open their page.</p>'})()+'<button type="button" class="tlink small" data-act="why-ign">Why ignore instead of block?</button></div><div class="card stack"><h2>Moved?</h2><button type="button" class="btn block" data-act="move-form" '+(S.readOnly?'disabled':'')+'>Change my grid</button></div>'+
    '<div class="row2"><button type="button" class="btn" data-act="intro-replay">Replay the tutorial</button><button type="button" class="btn" data-act="help">How it works</button></div>'+(window.CPAccount?window.CPAccount.cardHtml():'')+(S.isOwner&&DEMO()?ownerTools():''):'';
  const tabs=["Votes <span class=\"tcount\">"+MV.all.length+"</span>","Proposals <span class=\"tcount\">"+props.length+"</span>"].concat(mine?["Settings"]:[]);
  return '<div style="display:flex;gap:12px;align-items:center">'+avatar(uid,52)+'<div><h1>'+esc(nameOf(uid))+'</h1><div class="muted">'+(mine?'Your record':'Member record')+' · '+gridLink(S.members[uid].cell,gridName(S.members[uid].cell))+'</div>'+(mine?'':'<div class="ignrow"><button type="button" class="tlink" data-act="ign" data-v="'+uid+'">'+(ignored()[uid]?'Stop ignoring':'Ignore this member')+'</button> · <button type="button" class="tlink" data-act="why-ign">Why?</button></div>')+'</div></div>'+noticeCard(noticeList({member:uid}),"mem-"+uid)+
  scorecard(uid)+carousel("mem",tabs,[note+vRows,pRows].concat(mine?[settings]:[]))}
function memberView(uid){return backBtn+memberPage(uid)}

// ---------- ME tab ----------
function meView(){return memberPage(S.me)}
function ownerTools(){
  const sims=Object.keys(S.members).filter(id=>S.members[id].sim).length;
  const num=(id,label,v,step)=>'<label class="f" for="'+id+'">'+label+'<input class="inp" id="'+id+'" type="number" inputmode="decimal" min="0" step="'+step+'" value="'+v+'"></label>';
  return '<div class="card stack"><h2>Owner test tools</h2><p class="muted" style="margin:0">Only you see this. Shorten the clocks to test quickly.</p>'+
  '<div class="row2">'+num("cfg-h","Vote length (hours)",S.cfg.hours,"0.05")+num("cfg-m","Minimum voters",S.cfg.minVoters,"1")+num("cfg-p","Cool-down: new members and penalty box (hours)",S.cfg.penalty,"0.05")+'</div>'+
  '<button type="button" class="btn block" data-act="save-cfg">Save settings</button>'+
  '<div class="kv"><span>Test members</span><span>'+sims+'</span></div>'+
  '<div class="row2"><button type="button" class="btn" data-act="sim-add" data-v="mine">Add 6 to my grid</button><button type="button" class="btn" data-act="sim-add" data-v="spread">Add 20 across BC</button></div>'+
  '<button type="button" class="btn block" data-act="sim-vote">Test members vote on everything open</button>'+
  '<button type="button" class="btn block" data-act="seed">Add sample votes (10 open, 30 closed)</button>'+
  '<p class="muted" style="margin:0">About 1 in 7 test members skip each vote, so you can see the penalty box work. In elections, a couple of them also run.</p>'+
  '<button type="button" class="btn block danger" data-act="sim-clear" '+(sims?'':'disabled')+'>Remove all test members</button></div>'+
  '<div class="card stack"><h2>Vote record tests</h2><p class="muted" style="margin:0">Break the record on purpose, then open the vote record to see the check catch it.</p>'+
  '<button type="button" class="btn block" data-act="tamper-rec">Change a vote inside the record</button><button type="button" class="btn block" data-act="tamper-count">Change a vote in the count</button>'+
  '<button type="button" class="btn block" data-act="open-record">Open the vote record</button><button type="button" class="btn block danger" data-act="rec-clear">Clear the vote record</button></div>';
}

// ---------- HOW IT WORKS ----------
function helpView(){
  const r=(t,b)=>'<div class="rule"><b>'+t+'</b><span>'+b+'</span></div>';
  return backBtn+'<h1>How it works</h1><button type="button" class="btn ghost" data-act="intro-replay" style="align-self:flex-start">Replay the intro</button>'+
  '<div class="card stack"><h2>Grids</h2>'+r("Where you vote","BC is split into 100 km squares. You belong to the grid you live in.")+r("Equal say","For BC-wide votes each grid counts once, however many members it has.")+'</div>'+
  '<div class="card stack"><h2>Your responsibility</h2>'+r("Required votes","Once a grid proposal has enough supporters, it goes to a full vote that every member of the grid must vote on. Missing one puts you in the penalty box for "+fmtHours(S.cfg.penalty)+" after it ends.")+r("New members wait","You can normally start voting "+fmtHours(S.cfg.penalty)+" after you join, and only on votes that open after that."+(BETA_WAIVE?' For the beta phase, this is being waived.':'')+"")+(BETA_WAIVE?r("Grids of 20","A grid normally needs "+MIN_GRID+" members before it can vote on its own principles. For the beta phase, this is being waived."):'')+r("While waiting or penalized","You can\'t vote, propose, or run for a lead. Votes that open in that time don\'t count against you.")+r("BC-wide votes are optional","They never count against you.")+'</div>'+
  '<div class="card stack"><h2>Votes</h2>'+r("Final","Once cast, a vote can\'t be changed.")+r("How long","Each proposal has 72 hours in total. In that time it needs enough supporters to go to a full vote, and a majority to pass.")+r("Supporters","A proposal needs Yes votes from 5% of the grid, at least "+Q_FLOOR+" (or everyone, in a grid smaller than that), before it goes to a full vote.")+r("Passing","A simple majority of votes cast, with at least "+S.cfg.minVoters+" voting (or everyone, in a smaller grid). Closing a team needs two-thirds.")+r("Decided early","When the remaining voters can\'t change the result, it\'s marked as decided. It still takes effect only when voting ends.")+r("Ledger","When voting ends, every ballot is published under a private voter code.")+'</div>'+
  '<div class="card stack"><h2>Platform</h2>'+r("Three lists","Up to 10 principles (75 characters each), 20 policies and 20 plans, for each grid and for BC.")+r("Full lists","When a list is full, a new item must replace a named one.")+r("Going BC-wide","An item adopted by a grid can be put to all grids, one open BC-wide vote per grid at a time. A plan can go BC-wide only after its policies have.")+'</div>'+
  '<div class="card stack"><h2>Teams</h2>'+r("Created by vote","The grid votes to create, rename (majority) or close (two-thirds) a team.")+r("Leads are elected","An election runs "+fmtHours(S.cfg.hours)+". The winner needs more than half the ballots; otherwise the top two can go to a runoff.")+r("Recall","A lead can be recalled by a simple-majority grid vote, the same bar as winning.")+r("Records","Leads post links to quarterly meeting recordings. Nothing else is managed in the app.")+'</div>'+
  '<div class="card stack"><h2>Owner powers (beta)</h2><p class="small" style="color:var(--ink2);margin:0">During the beta, the app\'s creator owns it and can ship updates and remove illegal content. The owner does not change votes or results. Ownership may pass to the membership once the project matures.</p></div>';
}

// ---------- forms ----------
function formShell(title,inner,submitLabel,submitAct,extra){return '<button type="button" class="back" data-act="cancel-form">Cancel</button><h1>'+esc(title)+'</h1>'+inner+'<div class="err" id="f-err" role="alert"></div><div class="row2"><button type="button" class="btn" data-act="cancel-form">Cancel</button><button type="button" class="btn pri" data-act="'+submitAct+'"'+(extra||'')+'>'+esc(submitLabel)+'</button></div>'}
function slotChoices(kind,level,cell){const slots=seated(kind,level,cell);const used=Object.keys(slots).length;const full=used>=CAP[kind];
  return '<div style="font-weight:700;font-size:14px">'+(full?'The list is full. Pick one to replace:':'Where does it go?')+'</div><div class="stack" id="slotopts">'+(full?'':'<label class="opt on"><input type="radio" name="slot" value="new" checked><span>Add it to an open slot ('+(CAP[kind]-used)+' left)</span></label>')+Object.keys(slots).map((k,i)=>'<label class="opt'+(full&&i===0?' on':'')+'"><input type="radio" name="slot" value="'+slots[k].id+'" '+(full&&i===0?'checked':'')+'><span>Replace #'+k+': '+esc(itemTitle(slots[k]))+'</span></label>').join("")+'</div>'}
function formView(v){
  const cell=myCell();const voteNote='<p class="muted" style="margin:0">Voting opens now and runs '+fmtHours(S.cfg.hours)+'. Every member of '+gridName(cell)+' who can vote must.</p>';
  if(v.form==="propose"){const kind=v.kind;let f="";
    if(kind==="principle")f='<label class="f" for="p-text">Principle<input class="inp" id="p-text" placeholder="e.g. Freedom of speech is absolute." autocomplete="off"><span class="count" data-for="p-text" data-max="'+LIM.principle+'"></span></label><div class="note">One short belief, up to '+LIM.principle+' characters. How to achieve it belongs in a policy.</div>';
    else{const max=kind==="policy"?LIM.policy:LIM.plan;f='<label class="f" for="p-title">Title<input class="inp" id="p-title" autocomplete="off" placeholder="'+(kind==="policy"?"e.g. Accountability for media that fabricate":"e.g. Licensing route")+'"><span class="count" data-for="p-title" data-max="'+LIM.title+'"></span></label><label class="f" for="p-body">'+(kind==="policy"?"What the policy does":"The plan: laws to introduce, amend or repeal")+'<textarea class="inp" id="p-body" rows="'+(kind==="plan"?8:5)+'" placeholder="'+(kind==="plan"?"INTRODUCE: …&#10;AMEND: … s. …&#10;REPEAL: …":"Describe the policy in plain language.")+'"></textarea><span class="count" data-for="p-body" data-max="'+max+'"></span></label>';
      if(kind==="plan"){const pols=Object.values(seated("policy","prov",null)).concat(Object.values(seated("policy","cell",cell)));f+='<div style="font-weight:700;font-size:14px">Which policies does it deliver?</div>'+(pols.length?'<div class="stack">'+pols.map(p=>'<label class="opt"><input type="checkbox" name="links" value="'+p.id+'"><span>'+esc(p.title)+' <span class="muted">· '+esc(scopeLabel(p))+'</span></span></label>').join("")+'</div>':'<div class="note">No policies adopted yet. A plan can go BC-wide only after its policies have.</div>')}}
    return formShell("Propose a "+KIND_ONE[kind],'<div class="stack">'+f+slotChoices(kind,"cell",cell)+voteNote+'</div>',"Put it to a vote","submit-propose");}
  if(v.form==="promote"){const src=S.items[v.id];if(!src)return '<div class="card">Not found.</div>';
    return formShell("Send to a BC-wide vote",'<div class="stack"><p class="'+(src.kind==="principle"?"quote":"lede")+'">'+esc(itemTitle(src))+'</p>'+slotChoices(src.kind,"prov",null)+'<div class="note"><b>Step 1:</b> '+gridName(src.cell)+' votes on sending it. It goes ahead once more than half of all eligible members vote Yes, within '+fmtHours(S.cfg.hours)+'.<br><b>Step 2:</b> every grid votes for '+fmtHours(S.cfg.hours)+'. Results show once '+MIN_GRIDS+' grids have reached turnout. It\'s adopted if more than half of all grids vote in favour.<br>If your grid changes or removes this principle before then, the proposal is voided.</div></div>',"Put it to a grid vote","submit-promote",' data-id="'+src.id+'"');}
  if(v.form==="team"){const o=v.id?teams()[v.id]:null;
    if(v.act==="create")return formShell("Propose a new team",'<div class="stack"><label class="f" for="o-name">Name<input class="inp" id="o-name" placeholder="e.g. Marketing" autocomplete="off"><span class="count" data-for="o-name" data-max="'+LIM.team+'"></span></label><label class="f" for="o-purpose">What it does<textarea class="inp" id="o-purpose" rows="3" placeholder="e.g. Signs, social media and local ads for the grid."></textarea><span class="count" data-for="o-purpose" data-max="'+LIM.purpose+'"></span></label>'+voteNote+'<p class="muted" style="margin:0">If it passes, any member can start the lead election.</p></div>',"Put it to a vote","submit-team",' data-v="create"');
    if(v.act==="rename")return formShell("Rename "+(o?o.name:"team"),'<div class="stack"><label class="f" for="o-name">New name<input class="inp" id="o-name" value="'+esc(o?o.name:"")+'" autocomplete="off"><span class="count" data-for="o-name" data-max="'+LIM.team+'"></span></label><label class="f" for="o-purpose">What it does<textarea class="inp" id="o-purpose" rows="3">'+esc(o?o.purpose:"")+'</textarea><span class="count" data-for="o-purpose" data-max="'+LIM.purpose+'"></span></label>'+voteNote+'</div>',"Put it to a vote","submit-team",' data-v="rename" data-id="'+v.id+'"');
    if(v.act==="recall"){const lh=o?leadHistory(o):null;return formShell("Recall "+(lh&&lh.lead?nameOf(lh.lead):"the lead"),'<div class="stack"><label class="f" for="o-reason">Why? (shown on the ballot)<textarea class="inp" id="o-reason" rows="3"></textarea><span class="count" data-for="o-reason" data-max="'+LIM.purpose+'"></span></label><div class="note">Passes with a simple majority of votes cast, the same bar as winning the job. If it passes, the team needs a new election.</div>'+voteNote+'</div>',"Put it to a vote","submit-team",' data-v="recall" data-id="'+v.id+'"')}
    return formShell("Close "+(o?o.name:"team"),'<div class="stack"><label class="f" for="o-reason">Why close it?<textarea class="inp" id="o-reason" rows="3" placeholder="e.g. Merged into Ground Game."></textarea><span class="count" data-for="o-reason" data-max="'+LIM.purpose+'"></span></label><div class="note">Needs two-thirds of votes cast. If it passes, the lead\'s term ends and any open election is cancelled. The team\'s history stays visible.</div>'+voteNote+'</div>',"Put it to a vote","submit-team",' data-v="close" data-id="'+v.id+'"');}
  if(v.form==="meeting")return formShell("Add a meeting recording",'<div class="stack"><label class="f" for="m-url">Link (YouTube, Rumble…)<input class="inp" id="m-url" type="url" inputmode="url" placeholder="https://" autocomplete="off"></label><label class="f" for="m-date">Meeting date<input class="inp" id="m-date" type="date" value="'+new Date().toISOString().slice(0,10)+'"></label></div>',"Add","submit-meeting",' data-id="'+v.id+'"');
  if(v.form==="move")return formShell("Change your grid",'<div class="stack"><label class="f" for="town-q">Your town<input class="inp" id="town-q" type="search" value="'+esc(joinFilter)+'" placeholder="Start typing" autocomplete="off"></label><div class="townlist" id="townlist">'+townButtons("mv-town")+'</div><div id="mv-map">'+moveMap()+'</div><div class="note warn">Your new-member period restarts. Any lead role ends and any candidacy is withdrawn.</div></div>',"Move","submit-move");
  return "";
}
function moveMap(){return bcMap(()=>null,{click:"mv-cell",sel:joinSel&&joinSel.cell})+(joinSel?'<div class="note ok" style="margin-top:8px"><b>Move to '+gridName(joinSel.cell)+'</b>'+(joinSel.town?' · '+esc(joinSel.town):'')+'</div>':'')}
function showErr(m){const e=$("#f-err");if(e){e.textContent=m;e.scrollIntoView({block:"center",behavior:"smooth"})}toast(m)}
function newSlot(kind,level,cell){const slots=seated(kind,level,cell);for(let k=1;k<=CAP[kind];k++)if(!slots[k])return k;return null}
function val(id){const e=document.getElementById(id);return e?e.value.trim():""}
function boxedErr(){C={};const e=me();if(e.inBox){showErr((e.why==="new"?"New members":"Members in the penalty box")+" can't do this until "+fdt(e.until)+".");return true}return false}
function newId(){return String(S.me||"").replace(/[^0-9a-z]/gi,"").slice(0,16)+"-"+rid()+rid().slice(0,4)} // a proposal's id starts with its author's key: only they can write it
function newItem(extra){return Object.assign({level:"cell",cell:myCell(),by:S.me,at:now(),closes:now()+S.cfg.hours*3600e3},extra)}

async function submitPropose(){
  if(boxedErr())return;const kind=S.ui.view.kind,cell=myCell();
  const sl=document.querySelector('input[name="slot"]:checked');if(!sl)return showErr("Choose where it goes.");
  const it=newItem({kind,replaces:null,slot:null});
  if(kind==="principle"){const t=val("p-text");if(!t)return showErr("Write the principle first.");if(t.length>LIM.principle)return showErr("Keep it to "+LIM.principle+" characters (now "+t.length+").");it.text=t}
  else{const t=val("p-title"),b=val("p-body");const max=kind==="policy"?LIM.policy:LIM.plan;if(!t||!b)return showErr("Add a title and a description.");if(t.length>LIM.title)return showErr("Title: "+LIM.title+" characters max.");if(b.length>max)return showErr("Description: "+max+" characters max.");it.title=t;it.body=b;if(kind==="plan")it.links=[...document.querySelectorAll('input[name="links"]:checked')].map(x=>x.value)}
  if(sl.value==="new"){it.slot=newSlot(kind,"cell",cell);if(!it.slot)return showErr("The list is full. Pick an item to replace.")}else{it.replaces=sl.value;it.slot=seatOf(S.items[sl.value])}
  if(await guard(()=>enqueue(()=>S.db.doc("items/"+newId()).set(it)),"Proposed. It's on the Vote tab.")){S.ui.tab="vote";S.ui.view=null;S.ui.stack=[];render();window.scrollTo(0,0)}
}
async function submitPromote(id){
  if(boxedErr())return;const src=S.items[id];const sl=document.querySelector('input[name="slot"]:checked');if(!src)return;if(!sl)return showErr("Choose where it goes.");
  if(openProvFromCell(src.cell))return showErr("Your grid already has a BC-wide proposal under way.");
  if(!seatOf(src)||src.cell!==myCell())return showErr("Only principles your grid has adopted can be sent to BC.");const bb=bcBlock(src.id);if(bb)return showErr(bb+".");
  const it=newItem({kind:"promote",src:src.id,text:src.text,replaces:sl.value==="new"?null:sl.value});
  if(await guard(()=>enqueue(()=>S.db.doc("items/"+newId()).set(it)),"Your grid will vote on sending it to BC."))done();
}
async function submitTeam(act,oid){
  if(boxedErr())return;const base=newItem({kind:"office",act});
  if(act==="create"||act==="rename"){const n=val("o-name"),p=val("o-purpose");if(!n)return showErr("Give the team a name.");if(n.length>LIM.team)return showErr("Name: "+LIM.team+" characters max.");if(p.length>LIM.purpose)return showErr("Description: "+LIM.purpose+" characters max.");
    if(Object.values(teams()).some(o=>o.cell===base.cell&&!o.closedAt&&o.id!==oid&&o.name.toLowerCase()===n.toLowerCase()))return showErr("A team with that name already exists.");
    if(act==="rename"){const o=teams()[oid];if(o&&o.name===n&&o.purpose===p)return showErr("Nothing changed.")}
    base.name=n;base.purpose=p}
  else{const r=val("o-reason");if(r.length>LIM.purpose)return showErr("Reason: "+LIM.purpose+" characters max.");base.reason=r;if(act==="recall"){const lh=leadHistory(teams()[oid]);if(!lh.lead)return showErr("This team has no lead right now.");base.target=lh.lead}}
  if(oid)base.office=oid;
  if(await guard(()=>enqueue(()=>S.db.doc("items/"+newId()).set(base)),"Put to a grid vote. It's on the Vote tab."))done();
}
async function submitMeeting(id){const u=val("m-url"),d=val("m-date");if(!/^https:\/\/\S+\.\S+/.test(u))return showErr("Enter a full https:// link.");const t=d?new Date(d+"T12:00:00").getTime():now();if(await guard(()=>enqueue(()=>S.db.doc("meetings/"+newId()).set({office:id,url:u,date:t,by:S.me})),"Recording added."))done()}

// ---------- actions ----------
async function join(){if(!ADDR.cell)return;const cell=ADDR.cell,town=ADDR.town||townsIn(cell)[0]||"";const inTour=S.ui.ts!=null;
  if(inTour){introSeen=true;S.ui.ts=null;S.ui.tx={};S.ui.replay=false;try{localStorage.setItem("commons-intro-v2","1")}catch(e){}}
  const doc={cell,town,joinedAt:now(),cand:{},res:[]};if(introSeen)doc.introAt=now();
  try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist()}catch(e){}
  if(await guard(()=>enqueue(()=>S.db.doc("members/"+S.me).set(doc)))){S.members[S.me]=Object.assign({id:S.me},doc);ADDR.q="";ADDR.cell=null;ADDR.town="";S.ui.coolTip=true;S.ui.tab="plat";S.ui.plat=null;S.ui.view=null;S.ui.stack=[];render();window.scrollTo(0,0)}}
// "I voted" (turnout/<member>) only lists the votes you took part in, never how you voted.
function markTurnout(uid,ids){const cur=clean(S.votes[uid]);const b=Object.assign({},cur.b||{});ids.forEach(i=>b[i]=1);S.votes[uid]=Object.assign({id:uid},{b});return enqueue(()=>S.db.doc("turnout/"+uid).set({b}))}
// With real hosts it goes out a while after the ballot (but well before the vote closes), so the two can't be matched up by time.
const TURN_KEY=()=>"citizens-turnout-"+S.me;
function laterTurnout(it){let q=[];try{q=JSON.parse(localStorage.getItem(TURN_KEY())||"[]")}catch(e){}const wait=Math.min(S.voter.turnoutDelay(),Math.max(0,(it.closes-now())/3));
  q.push({i:it.id,due:now()+wait});try{localStorage.setItem(TURN_KEY(),JSON.stringify(q))}catch(e){}setTimeout(flushTurnout,wait+500)}
async function flushTurnout(){if(!S.me||!S.db)return;let q=[];try{q=JSON.parse(localStorage.getItem(TURN_KEY())||"[]")}catch(e){}const due=q.filter(x=>x.due<=now());if(!due.length)return;
  if(await guard(()=>markTurnout(S.me,due.map(x=>x.i)))){const left=q.filter(x=>x.due>now());try{localStorage.setItem(TURN_KEY(),JSON.stringify(left))}catch(e){}}}
// A small question box: resolves with the chosen button's key ("" if closed). Buttons: [key, label, primary?]
function askBox(title,body,buttons){return new Promise(res=>{const el=document.createElement("div");el.className="qbg";
  el.innerHTML='<div class="qbox" role="dialog" aria-modal="true" aria-labelledby="ask-t"><h2 id="ask-t">'+esc(title)+'</h2>'+body+'<div class="qbtns">'+
    buttons.map(b=>b[3]?'<a class="btn block'+(b[2]?' pri':'')+'" href="'+esc(b[3])+'" target="_blank" rel="noopener" data-ask="'+b[0]+'">'+esc(b[1])+'</a>':'<button type="button" class="btn block'+(b[2]?' pri':'')+'" data-ask="'+b[0]+'">'+esc(b[1])+'</button>').join("")+'</div></div>';
  const end=k=>{el.remove();document.removeEventListener("keydown",key);res(k)};const key=e=>{if(e.key==="Escape")end("")};
  el.onclick=e=>{const b=e.target.closest("[data-ask]");if(b)return end(b.dataset.ask);if(e.target===el)end("")};document.addEventListener("keydown",key);
  document.body.appendChild(el);const f=el.querySelector(".btn.pri")||el.querySelector(".btn");if(f)f.focus()})}
// "Super securing your ballot…" while it travels (shown at once through Tor, else only if it takes a moment)
function securing(tor,text){const el=document.createElement("div");el.className="qbg lockbg";el.setAttribute("role","status");
  el.innerHTML='<div class="qbox sec"><div class="secring" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm-1 14-4-4 1.4-1.4L11 13.2l4.6-4.6L17 10l-6 6Z"/></svg></div><b>'+esc(text||"Securing your ballot…")+'</b>'+
    (tor?'<p class="muted">Sending it by a private route, so no one can tell it&#39;s yours.</p>':'')+'</div>';
  const t=setTimeout(()=>document.body.appendChild(el),tor?0:300);
  return{close(){clearTimeout(t);el.remove()},sent(){if(!el.parentNode)document.body.appendChild(el);el.querySelector(".qbox").innerHTML='<div class="secring ok" aria-hidden="true">'+IC.check+'</div><b>Sent</b>'}}}
// In a regular web browser, once per device before the first vote: the app or Tor Browser hide where the vote came from.
const TIP_KEY="citizens-tor-tip";
async function torTip(){if(!S.voter||S.voter.native||S.voter.route()!=="plain")return true;try{if(localStorage.getItem(TIP_KEY))return true}catch(e){return true}
  const k=await askBox("For the most private vote",'<p>Your vote is secret from other members either way. But in a regular web browser, the host that receives your vote can see your internet address.</p><p>For the strongest privacy, vote in the Citizens Party app, or open this page in Tor Browser.</p>',
    [["app","Get the app",false,"/download.html"],["tor","Get Tor Browser",false,"https://www.torproject.org/download/"],["go","Vote here anyway",true],["","Cancel"]]);
  if(k==="go"){try{localStorage.setItem(TIP_KEY,"1")}catch(e){}return true}return false}
// Sending a vote is one blocking step: the page underneath is frozen (no re-render, scroll, taps or Back) until a host
// confirms the ballot, then "✓ Sent" for a moment. After 15 s the overlay steps aside and the card shows
// "Sending privately…" until it arrives. Only a private route that truly won't open asks the member anything.
function freeze(on){S.ui.frozen=on;document.body.classList.toggle("locked",on);if(!on){C={};render()}}
const SEND_WAIT=15000;
async function cast(id,v){C={};const it=S.items[id];if(!it)return;if(myVote(id)!=null)return toast("You've already voted on this.");if(isClosed(it))return toast("Voting has ended.");if(!canVoteOn(it))return toast("You can't vote on this one.");S.ui.pick=null;
  const P=periodOf(it.at);
  if(S.voter){if(!await torTip())return;const tor=S.voter.route()==="tor";freeze(true);const busy=securing(tor);
    const job=S.voter.cast(id,v,P,60000);let slow=false,r;
    try{r=await Promise.race([job,new Promise(res=>setTimeout(()=>{slow=true;res(null)},SEND_WAIT))])}catch(e){busy.close();freeze(false);return toast((e&&e.message&&e.message.length<48)?e.message:"Couldn't save. Check your connection.","err")}
    LOCALV[id]=v;laterTurnout(it);
    if(slow||(r&&!r.sent&&!r.torFailed)){busy.close();justVoted(id);freeze(false); // still on its way: the card says so
      job.then(r2=>{if(r2&&r2.torFailed)return askPrivate(id);C={};softRender()},()=>{C={};softRender()});return}
    if(r&&r.sent){busy.sent();await new Promise(res=>setTimeout(res,1500))}
    busy.close();justVoted(id);freeze(false);
    if(r&&r.torFailed)return askPrivate(id);
    toast("Vote sent");return}
  const k=myKey(it),t=now();
  if(!S.stamps[k]&&!await guard(()=>enqueue(()=>S.db.doc("stamps/"+k).set({period:P,grid:myCell()}))))return;
  if(await guard(()=>enqueue(()=>S.db.doc("ballots/"+k+"_"+id).set({v,t,g:myCell()})),"Vote sent")){LOCALV[id]=v;justVoted(id);await guard(()=>markTurnout(S.me,[id]));recordVotes([{i:id,k,v,t}])}}
// the private route won't open: the member chooses (the sheet as before)
async function askPrivate(id){const k=await askBox("The private route didn't open",'<p>Your network may be blocking Tor. Some workplaces and public Wi-Fi do. Your vote is saved on this phone.</p><p class="muted">Sent the normal way, your vote is still secret from other members, but the host that receives it could see your internet address.</p>',
    [["plain","Send it the normal way",true],["wait","Keep trying"]]);
  if(k==="plain"){freeze(true);const b2=securing(false,"Sending your ballot…");let r;try{r=await S.voter.sendPlain(id)}catch(e){}if(r&&r.sent){b2.sent();await new Promise(res=>setTimeout(res,1500))}b2.close();freeze(false);toast(r&&r.sent?"Vote sent":"Saved. It sends once you're online.",r&&r.sent?"ok":"warn")}else{C={};softRender()}}
// the vote card's line while your ballot is on its way, then "✓ Sent" for a few seconds
function sendStatus(it){if(!S.voter)return '';const pend=S.voter.pending().some(x=>x.i===it.id);S.ui.wasPend=S.ui.wasPend||{};S.ui.sentAt=S.ui.sentAt||{};
  if(pend){S.ui.wasPend[it.id]=1;return '<p class="sendst" role="status"><span class="spin sm" aria-hidden="true"></span>Sending privately…</p>'}
  if(S.ui.wasPend[it.id]){delete S.ui.wasPend[it.id];S.ui.sentAt[it.id]=now();setTimeout(()=>{C={};softRender()},3100)}
  return S.ui.sentAt[it.id]&&now()-S.ui.sentAt[it.id]<3000?'<p class="sendst ok" role="status">✓ Sent</p>':''}
// the card's "You voted" line plays a short check animation once, right after the second tap
function justVoted(id){S.ui.justVoted=id;clearTimeout(justVoted.t);justVoted.t=setTimeout(()=>{S.ui.justVoted=null},1600)}
async function stand(eid){C={};const el=S.items[eid];if(!el||isClosed(el))return;const m=clean(myMember());const cand=Object.assign({},m.cand||{});const on=!cand[eid];if(on){if(me().inBox)return toast("You can't run while "+(me().why==="new"?"a new member.":"in the penalty box."));cand[eid]=now()}else delete cand[eid];await guard(()=>enqueue(()=>S.db.doc("members/"+S.me).set(Object.assign({},m,{cand}))),on?"You're running for lead.":"Candidacy withdrawn.")}
async function resign(oid){const m=clean(myMember());await guard(()=>enqueue(()=>S.db.doc("members/"+S.me).set(Object.assign({},m,{res:(m.res||[]).concat([{o:oid,at:now()}])}))),"You've stepped down.")}
async function startElection(oid,only){C={};if(me().inBox)return toast("You can't do this right now.");const o=teams()[oid];if(!o||o.closedAt)return;if(openElection(oid))return toast("An election is already open.");if(leadHistory(o).lead)return toast("This team already has a lead.");
  const prev=electionsOf(oid).length;const it=newItem({kind:"office",act:"election",office:oid,cell:o.cell,round:only?2:1});if(only)it.only=only.split(",");
  await guard(()=>enqueue(()=>S.db.doc("items/"+newId()).set(it)),only?"Runoff started.":"Election started. Candidates can sign up now.")}
async function move(){
  if(!joinSel)return showErr("Pick your new town or grid.");const m=clean(myMember());if(joinSel.cell===m.cell&&joinSel.town===m.town)return showErr("That's your current grid.");
  const t=now();const leading=Object.values(teams()).filter(o=>leadHistory(o).lead===S.me).map(o=>({o:o.id,at:t}));
  if(await guard(()=>enqueue(()=>S.db.doc("members/"+S.me).set(Object.assign({},m,{cell:joinSel.cell,town:joinSel.town||"",joinedAt:t,movedAt:t,cand:{},res:(m.res||[]).concat(leading)}))),"Moved to "+gridName(joinSel.cell)+".")){joinSel=null;joinFilter="";done()}
}
async function saveCfg(){const h=parseFloat(val("cfg-h")),m=parseInt(val("cfg-m"),10),pn=parseFloat(val("cfg-p")),pr=pn;if(!(h>0)||!(m>=1)||!(pn>=0)||!(pr>=0))return toast("Check the numbers.","warn");await guard(()=>enqueue(()=>S.db.doc("config/settings").set({hours:h,minVoters:m,penalty:pn,probation:pr})),"Settings saved.")}
function rid(){return Math.random().toString(36).slice(2,10)}
async function simAdd(mode){
  const n=mode==="mine"?6:20;
  for(let i=0;i<n;i++){let cell,town;if(mode==="mine"){cell=myCell();town=townsIn(cell)[0]||""}else{const t=TOWNS[Math.floor(Math.random()*TOWNS.length)];cell=TOWN_CELL[t[0]];town=t[0]}
    await guard(()=>enqueue(()=>S.db.doc("members/sim-"+rid()).set({cell,town,joinedAt:now()-60*864e5,cand:{},res:[],sim:true})))}
  toast("Added "+n+" test members.");
}
async function simVote(){
  C={};const sims=Object.keys(S.members).filter(id=>S.members[id].sim);if(!sims.length)return toast("Add test members first.");
  for(const el of Object.values(S.items).filter(i=>isElection(i)&&!isClosed(i)&&!(i.only&&i.only.length))){const cands=electionCands(el);if(cands.length>=2)continue;
    const pool=sims.filter(id=>S.members[id].cell===el.cell&&!cands.includes(id)&&!engine(id).inBox).slice(0,2-cands.length);
    for(const id of pool){const m=clean(S.members[id]);const d=Object.assign({},m,{cand:Object.assign({},m.cand||{},{[el.id]:now()})});S.members[id]=Object.assign({id},d);await guard(()=>enqueue(()=>S.db.doc("members/"+id).set(d)))}}
  C={};let cnt=0;const recs=[];
  for(const id of sims){const e=engine(id);const done=[];
    for(const it of Object.values(S.items)){if(isClosed(it)||took(id,it.id)||!e.elig[it.id])continue;if(Math.random()<0.15)continue;let v;
      if(isElection(it)){const c=electionCands(it);if(!c.length)continue;v=c[Math.floor(Math.random()*c.length)]}else v=Math.random()<0.65?"y":"n";
      const w=simBallot(id,it,v,now());for(const [path,doc] of w)await guard(()=>enqueue(()=>S.db.doc(path).set(doc)));done.push(it.id);recs.push({i:it.id,k:simKey(id,it),v,t:w[w.length-1][1].t})}
    if(done.length){await guard(()=>markTurnout(id,done));cnt++}}
  toast(cnt?cnt+" test members voted.":"Nothing new for test members to vote on.");if(recs.length)await recordVotes(recs);
}
// TEST ONLY: test members have no phones, so they get stand-in voting keys and stamps (the hosts allow these from the owner while testing)
const simKey=(id,it)=>id+"-"+periodOf(it.at);
function simBallot(id,it,v,t,cell){const k=simKey(id,it),out=[];if(!S.stamps[k]){S.stamps[k]={period:periodOf(it.at),grid:cell||S.members[id].cell,sim:true};out.push(["stamps/"+k,clean(S.stamps[k])])}out.push(["ballots/"+k+"_"+it.id,{v,t}]);return out}
async function simClear(){const sims=Object.keys(S.members).filter(id=>S.members[id].sim);for(const id of sims){if(S.votes[id])await guard(()=>enqueue(()=>S.db.doc("turnout/"+id).delete()));await guard(()=>enqueue(()=>S.db.doc("members/"+id).delete()))}toast("Test members removed.")}

// ---------- the vote record: ballots sealed into a chain of pages ----------
// Record format (v2)
//   vote  {i:item id, k:voting key, v:choice, t:time cast (ms)}: a copy of a signed ballot (ballots/<k>_<i>). The
//         ballot's signature (by the voting key) and its stamp are checked by every app and every host.
//   block {n, prev, at, votes:[…], h}   h = SHA-256 of blockMsg(block); prev of block 1 = 64 zeros
// Ballots are sealed a few minutes after they're cast, in batches, by other members' apps. An app never seals its
// own ballots, so who wrote a page says nothing about whose votes are on it.

const GENESIS="0".repeat(64);const BLOCK_MAX=150;const TAB_ID=Math.random().toString(36).slice(2,10);
const ENC=new TextEncoder();
const hexOf=buf=>Array.from(new Uint8Array(buf),x=>x.toString(16).padStart(2,"0")).join("");
async function sha256(s){return hexOf(await crypto.subtle.digest("SHA-256",ENC.encode(s)))}
const blockMsg=b=>"citizens-block/2|"+b.n+"|"+b.prev+"|"+b.at+"|"+JSON.stringify((b.votes||[]).map(x=>[x.i,x.k,x.v,x.t]));
const shortFp=h=>h?h.slice(0,8)+"…"+h.slice(-4):"—";
// appending: one writer at a time (a short lease on chainlock/main), then read the newest block and seal the next one on top of it
let chainQ=Promise.resolve();
function recordVotes(list){if(!S.db||!list.length||!(window.crypto&&crypto.subtle))return Promise.resolve();
  const p=chainQ.then(()=>appendVotes(list)).catch(e=>{console.warn("record",e);toast("Couldn't seal your vote into the record.","err")});chainQ=p;return p}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function holdLock(){const lock=S.db.doc("chainlock/main");for(let a=0;a<25;a++){const r=await lock.acquire({holder:S.me+"-"+TAB_ID,ttlMs:3000});if(r&&r.acquired)return;await pause(250+Math.random()*500)}throw new Error("record busy")}
function sealedSet(){const s=new Set();for(const b of chainBlocks())for(const x of b.votes||[])s.add(x.k+"|"+x.i);return s}
async function appendVotes(list){
  for(let off=0;off<list.length;off+=BLOCK_MAX){await holdLock();
    const q=await S.db.collection("chain").orderBy("n","desc").limit(1).get();const last=q.docs.length?q.docs[0].data():null;
    const sealed=sealedSet();const votes=list.slice(off,off+BLOCK_MAX).filter(x=>!sealed.has(x.k+"|"+x.i)).map(x=>({i:x.i,k:x.k,v:x.v,t:x.t}));if(!votes.length)continue;
    const b={n:last?last.n+1:1,prev:last?last.h:GENESIS,at:now(),votes};b.h=await sha256(blockMsg(b));
    await S.db.doc("chain/"+String(b.n).padStart(8,"0")).set(b)}}
// with real hosts, every member's app now and then seals other members' ballots that have waited a few minutes
const SEAL_AFTER=5*60e3;let sealAt=0;
function sealPending(){if(!S.db||S.readOnly||!S.voter||!allLoaded()||!(S.loaded||{}).chain)return;const t=now();if(t<sealAt)return;sealAt=t+60e3+Math.random()*60e3;
  const sealed=sealedSet(),out=[],bal=BAL();for(const i in bal){const it=S.items[i];const mk=myKey(it);for(const b of bal[i])if(b.k!==mk&&!sealed.has(b.k+"|"+i)&&t-b.t>SEAL_AFTER)out.push({i,k:b.k,v:b.v,t:b.t})}
  if(out.length)recordVotes(out.sort((a,b)=>a.t-b.t))}
// checking: recompute every fingerprint and link, and compare every sealed vote with its signed ballot
let VER=null,verBusy=false;
const revKey=()=>{const r=S.rev||{};return (r.chain||0)+"|"+(r.ballots||0)+"|"+(r.stamps||0)+"|"+(r.items||0)};
function maybeVerify(force){if(verBusy||!S.db||!(window.crypto&&crypto.subtle))return;const rk=revKey();if(!force&&VER&&VER.rev===rk)return;verBusy=true;
  verifyRecord(rk).then(r=>{VER=r}).catch(e=>{console.warn(e);VER={rev:rk,at:now(),blocks:0,votes:0,gone:0,missing:0,mism:{},byVote:{},probs:[{msg:"The record couldn't be checked on this device."}],head:null,headN:0}}).finally(()=>{verBusy=false;softRender()})}
function chainBlocks(){return Object.values(S.chain||{}).filter(b=>b&&typeof b.n==="number").sort((a,b)=>a.n-b.n)}
async function verifyRecord(rk){const blocks=chainBlocks();const probs=[];const byVote={};let prev=GENESIS,expect=1,nv=0,gone=0;
  const what=i=>{const it=S.items[i];return it?'“'+String(it.text||it.title||it.name||"a vote").slice(0,48)+'”':"a vote"};
  const bal={};const B=BAL();for(const i in B)for(const x of B[i])bal[x.k+"|"+i]=x;
  for(const b of blocks){
    if(b.n!==expect)probs.push({n:b.n,msg:"Block "+expect+(b.n-expect>1?"–"+(b.n-1):"")+" is missing."});
    if(b.prev!==prev)probs.push({n:b.n,msg:"Block "+b.n+" doesn't link to the block before it."});
    if(await sha256(blockMsg(b))!==b.h)probs.push({n:b.n,msg:"Block "+b.n+" was changed after it was sealed."});
    prev=b.h;expect=b.n+1;
    for(const x of b.votes||[]){const kk=x.k+"|"+x.i;
      if(byVote[kk]){if(byVote[kk].v!==x.v)probs.push({n:b.n,msg:"Block "+b.n+" has a second, different vote from the same voter on "+what(x.i)+"."});continue}
      nv++;if(!S.items[x.i])gone++;
      byVote[kk]={n:b.n,v:x.v,fp:(await sha256("citizens-vote/2|"+x.i+"|"+x.k+"|"+x.v+"|"+x.t)).slice(0,32)}}}
  // the count must match the record, vote for vote
  let missing=0;const mism={};
  for(const kk in bal){const r=byVote[kk];if(!r){missing++;continue}if(r.v!==bal[kk].v){mism[kk]=1;probs.push({n:r.n,msg:"A vote on "+what(kk.slice(kk.indexOf("|")+1))+" in the count doesn't match the record."})}}
  for(const kk in byVote){const i=kk.slice(kk.indexOf("|")+1);if(!bal[kk]&&S.items[i])probs.push({n:byVote[kk].n,msg:"A recorded vote on "+what(i)+" has no signed ballot behind it."})}
  const head=blocks.length?blocks[blocks.length-1]:null;
  return {rev:rk,at:now(),blocks:blocks.length,votes:nv,gone,missing,mism,probs,byVote,head:head?head.h:null,headN:head?head.n:0}}
function recStatus(){if(!VER)return {cls:"",icon:"…",title:"Checking the record…"};
  if(VER.probs.length)return {cls:"bad",icon:"✕",title:VER.probs.length===1?"1 problem found":VER.probs.length+" problems found"};
  if(!VER.blocks)return {cls:"",icon:"○",title:"No votes on the record yet"};
  return {cls:"ok",icon:"✓",title:"The record checks out"}}
function chainView(){maybeVerify();const st=recStatus();const blocks=chainBlocks();
  const recent=blocks.slice(-8).reverse();
  return backBtn+'<div><h1 style="margin:0">The vote record</h1><p class="lede" style="margin-top:8px">Every vote is signed on the voter\'s phone with a voting key only they know, then sealed into a chain of blocks. Each block\'s fingerprint is worked out from its votes and the block before it, so changing any past vote breaks the chain.</p></div>'+
  '<div class="card recst '+st.cls+'"><div class="recst-h"><span class="recic">'+st.icon+'</span><b>'+st.title+'</b></div>'+
  (VER?'<div class="kv"><span>Blocks</span><span>'+VER.blocks.toLocaleString()+'</span></div><div class="kv"><span>Votes on the record</span><span>'+VER.votes.toLocaleString()+'</span></div>'+
    '<div class="kv"><span>Latest fingerprint</span><span class="code">'+(VER.head?shortFp(VER.head):'—')+'</span></div><div class="kv"><span>Checked</span><span>'+new Date(VER.at).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit",second:"2-digit"})+'</span></div>':'')+
  '<button type="button" class="btn block" data-act="rec-check" '+(verBusy?'disabled':'')+'>'+(verBusy?'Checking…':'Check again')+'</button></div>'+
  (VER&&VER.probs.length?'<div class="card stack recprob"><h2>What\'s wrong</h2><ul>'+VER.probs.slice(0,12).map(p=>'<li>'+esc(p.msg)+'</li>').join("")+'</ul>'+(VER.probs.length>12?'<p class="muted small" style="margin:0">And '+(VER.probs.length-12)+' more.</p>':'')+'</div>':'')+
  (VER&&VER.missing?'<p class="small recwarn">'+VER.missing+' vote'+(VER.missing===1?' in the count isn\'t':'s in the count aren\'t')+' on the record. Members\' apps seal new votes within a few minutes.</p>':'')+
  '<div class="card stack"><h2>Copies</h2><p class="muted" style="margin:0">Anyone with a copy can compare its latest fingerprint with the one above. If they match, every vote before it is identical in both.</p>'+
  (VER&&VER.head?'<p class="code recfp">'+VER.head+'</p>':'')+
  '<button type="button" class="btn block" data-act="rec-dl" '+(blocks.length?'':'disabled')+'>Download a copy</button></div>'+
  (recent.length?'<div class="secthd"><h2>Latest blocks</h2><span class="muted small">'+blocks.length+'</span></div><div class="card blks">'+recent.map(b=>'<div class="blkrow"><div><b>Block '+b.n+'</b><span class="muted small"> · '+(b.votes||[]).length+' vote'+((b.votes||[]).length===1?'':'s')+' · '+fdt(b.at)+'</span></div><div class="small muted">Fingerprint <span class="code">'+shortFp(b.h)+'</span> '+(b.prev===GENESIS?'· start of the record':'· links to <span class="code">'+shortFp(b.prev)+'</span>')+'</div></div>').join("")+'</div>':'')+
  ''}
async function recDownload(){const dl=window.claude&&window.claude.use?await window.claude.use("downloads"):null;if(!dl)return toast("Downloads aren't available here.");
  const data=JSON.stringify({format:"citizens-record/2",exported:new Date().toISOString(),latest:VER&&VER.head,blocks:chainBlocks(),stamps:S.stamps},null,1);
  try{await dl.save({filename:"citizens-vote-record-"+new Date().toISOString().slice(0,10)+".json",data})}catch(e){}}
// owner test tools: break the record on purpose, to see the check catch it
async function tamperRecord(){const b=chainBlocks().filter(x=>(x.votes||[]).length).pop();if(!b)return toast("Nothing on the record yet.");
  const votes=b.votes.map(x=>Object.assign({},x));const x=votes[0];x.v=x.v==="y"?"n":x.v==="n"?"y":x.v+"_";
  await guard(()=>enqueue(()=>S.db.doc("chain/"+String(b.n).padStart(8,"0")).set(Object.assign({},b,{votes}))),"Changed a vote inside block "+b.n+".")}
async function tamperCount(){const blocks=chainBlocks();for(let j=blocks.length-1;j>=0;j--)for(const x of blocks[j].votes||[]){const cur=S.ballots[x.k+"_"+x.i];if(!cur||(x.v!=="y"&&x.v!=="n"))continue;
    return guard(()=>enqueue(()=>S.db.doc("ballots/"+x.k+"_"+x.i).set(Object.assign(clean(cur),{v:x.v==="y"?"n":"y"}))),"Changed a vote in the count.")}
  toast("No recorded Yes/No vote to change.")}
async function clearRecord(){const ids=Object.keys(S.chain||{});for(const id of ids)await guard(()=>enqueue(()=>S.db.doc("chain/"+id).delete()));toast("Vote record cleared.")}

// ---------- sample data (owner test tool) ----------
const SEED={
  prin:["Government exists to protect individual rights.","Parents are the primary educators of their children.","Taxes should be as low as possible and spent in the open.","Property owners decide what happens on their land.","Decisions should be made as close to home as possible.","Every public dollar spent must be published online.","Free speech includes speech we disagree with.","Elected officials answer to voters, not parties.","No new law without a sunset clause.","Healthcare decisions belong to patients and doctors.","Resource projects should benefit the communities they affect."],
  prinOpen:["Citizens may recall any elected official.","The province should not borrow for day-to-day spending.","Farmland is for farming."],
  pol:[["Online budget ledger","Publish every provincial expenditure over $10,000 within 30 days, searchable by ministry, vendor and riding."],["Recall reform","Lower the signature threshold for recall petitions from 40% to 25% of registered voters in the riding."],["Funding follows the student","School funding follows each student to any accredited public or independent school."],["Permit shot clock","A residential building permit is approved automatically if the municipality has not decided within 60 days."],["Ten-year sunset review","Every regulation expires after 10 years unless the legislature renews it by vote."],["Free votes in the legislature","MLAs vote freely on every bill except the budget and confidence motions."],["Rural ER guarantee","No emergency room is closed unless a replacement within 90 minutes' drive is already open."],["Fuel tax holiday","Suspend the provincial fuel tax for 12 months and publish the effect on pump prices."]],
  polOpen:[["Citizens' initiative threshold","Any proposal signed by 5% of voters in every riding goes to a binding provincial referendum."],["Ferry service guarantee","BC Ferries must publish a reliability score each month and refund fares for cancelled sailings."],["Independent auditor for Crown corporations","The Auditor General audits every Crown corporation each year and publishes the full report."]],
  plan:[["Open Books Act","INTRODUCE: Open Books Act, requiring every ministry to publish payments over $10,000 within 30 days.\nAMEND: Financial Administration Act s. 4 to make the ledger a legal duty of the Treasury Board.",0],["Recall Act amendments","AMEND: Recall and Initiative Act s. 19 to lower the petition threshold to 25%.\nAMEND: s. 20 to extend the signing period from 60 to 90 days.",1],["Housing permits bill","INTRODUCE: Housing Permit Timelines Act with a 60-day deemed-approval rule.\nREPEAL: Local Government Act s. 490(3).",3]],
  planOpen:["Free Votes Standing Order","AMEND: Standing Orders of the Legislative Assembly to allow free votes on all non-budget bills.",5],
  teams:[["Ground Game","Door knocking, phone banks and election-day rides."],["Fundraising","Finds donors and runs fundraising events, outside the app."],["Social Media","Runs the grid's online accounts."],["Events","Town halls, barbecues and meet-and-greets."]],
};
async function seedSamples(){
  C={};const cell=myCell();const t0=now();const D=864e5,H=3600e3;
  const sid=newId;
  const writes=[];const put=(path,doc)=>writes.push([path,doc]);
  // members: make sure there are enough test members here and in two other grids
  const others=["Vancouver","Prince George","Kelowna","Victoria"].map(t=>TOWN_CELL[t]).filter(c=>c!==cell).slice(0,2);
  const pool={};const memDocs={};
  const ensure=(g,n)=>{let ids=Object.keys(S.members).filter(id=>S.members[id].sim&&S.members[id].cell===g);
    for(let i=ids.length;i<n;i++){const id="sim-"+rid();memDocs[id]={cell:g,town:townsIn(g)[0]||"",joinedAt:t0-200*D,cand:{},res:[],sim:true};ids.push(id)}
    ids.forEach(id=>{if(!memDocs[id]){memDocs[id]=Object.assign({},clean(S.members[id]));if(memDocs[id].joinedAt>t0-200*D)memDocs[id].joinedAt=t0-200*D}});pool[g]=ids;};
  ensure(cell,9);others.forEach(g=>ensure(g,6));
  const ballots={};const castFor=(id,item,v,ts)=>{(ballots[id]=ballots[id]||{b:{},bt:{}}).b[item]=v;ballots[id].bt[item]=ts||t0};const when=(item,i,n)=>{const o=items[item];const end=Math.min(o.closes,t0);return Math.round(o.at+(end-o.at)*(i+1+(hash(item+i)%100)/100)/(n+2))};
  const voteAll=(ids,item,pass)=>{const n=ids.length;const r=(hash(item)%1000)/1000;let yes=Math.round(n*(pass?0.53+r*0.32:0.2+r*0.27));if(pass&&yes*2<=n)yes=Math.floor(n/2)+1;if(!pass&&yes*2>n)yes=Math.floor(n/2);ids=ids.slice().sort((a,b)=>hash(a+item)-hash(b+item));ids.forEach((id,i)=>castFor(id,item,i<yes?"y":"n",when(item,i,n)))};
  const items={};const add=(o)=>{const id=sid();items[id]=o;return id};
  // 30 closed votes in your grid, oldest first, one every 2 days
  let day=64;const slotAt=()=>{const at=t0-day*D;day-=2;return{at,closes:at+3*D}};
  const base=(x)=>Object.assign({level:"cell",cell,by:pool[cell][0]},slotAt(),x);
  const prinIds=[];
  for(let i=0;i<7;i++){const id=add(base({kind:"principle",text:SEED.prin[i],slot:null,replaces:null}));prinIds.push(id);voteAll(pool[cell],id,true)}
  [[7,false],[8,false]].forEach(([i,p])=>{const id=add(base({kind:"principle",text:SEED.prin[i],slot:null,replaces:null}));voteAll(pool[cell],id,p)});
  {const id=add(base({kind:"principle",text:SEED.prin[9],slot:null,replaces:prinIds[2]}));voteAll(pool[cell],id,true)}
  {const id=add(base({kind:"principle",text:SEED.prin[10],slot:null,replaces:prinIds[4]}));voteAll(pool[cell],id,false)}
  const polIds=[];
  SEED.pol.forEach(([t,b],i)=>{const pass=i!==2&&i!==7;const id=add(base({kind:"policy",title:t,body:b,slot:null,replaces:null}));polIds.push(id);voteAll(pool[cell],id,pass)});
  SEED.plan.forEach(([t,b,li],i)=>{const id=add(base({kind:"plan",title:t,body:b,links:[polIds[li]],slot:null,replaces:null}));voteAll(pool[cell],id,i!==2)});
  const teamIds=[];
  SEED.teams.forEach(([n,pu],i)=>{const id=add(base({kind:"office",act:"create",name:n,purpose:pu}));teamIds.push(id);voteAll(pool[cell],id,i!==2)});
  {const id=add(base({kind:"office",act:"rename",office:teamIds[3],name:"Events & Outreach",purpose:"Town halls, barbecues, meet-and-greets and community outreach."}));voteAll(pool[cell],id,true)}
  const leads={};
  [0,1,3].forEach((ti,k)=>{const x=base({kind:"office",act:"election",office:teamIds[ti],round:1});const id=add(x);const c1=pool[cell][1+k*2],c2=pool[cell][2+k*2];
    memDocs[c1].cand=Object.assign({},memDocs[c1].cand,{[id]:x.at});memDocs[c2].cand=Object.assign({},memDocs[c2].cand,{[id]:x.at});
    {const sh=(hash(id)%1000)/1000;pool[cell].forEach((v,i)=>castFor(v,id,i<Math.ceil(pool[cell].length*(0.55+sh*0.25))?c1:c2,when(id,i,pool[cell].length)))}leads[teamIds[ti]]=c1});
  // fix counts: that's 11 principles + 8 policies + 3 plans + 4 teams + 1 rename + 3 elections = 30
  // other grids: adopted principles so their platforms have content
  others.forEach((g,gi)=>{for(let i=0;i<5;i++){const at=t0-(50-i*6-gi)*D;const id=add({kind:"principle",level:"cell",cell:g,by:pool[g][0],at,closes:at+3*D,text:SEED.prin[(i*2+gi+3)%SEED.prin.length],slot:null,replaces:null});voteAll(pool[g],id,true)}});
  // two adopted BC-wide principles sent from your grid
  [0,1].forEach(k=>{const at=t0-(20-k*6)*D;const id=add({kind:"principle",level:"prov",cell:null,fromItem:prinIds[k],fromCell:cell,by:pool[cell][0],at,closes:at+3*D,text:SEED.prin[k],slot:null,replaces:null});[cell,...others].forEach(g=>voteAll(pool[g],id,true))});
  // 10 open votes in your grid
  let mins=50;const myStart=(myMember().joinedAt||0)+S.cfg.penalty*3600e3+1000;const openBase=(x)=>{const at=Math.max(t0-mins*60e3,Math.min(myStart+(50-mins)*1000,t0-1000));mins-=4;return Object.assign({level:"cell",cell,by:pool[cell][(mins/4|0)%pool[cell].length],at,closes:at+S.cfg.hours*H},x)};
  const partial=(id,f)=>{const ids=pool[cell].slice(0,Math.ceil(pool[cell].length*f));ids.forEach((v,i)=>castFor(v,id,i%3===2?"n":"y",when(id,i,ids.length)))};
  partial(add(openBase({kind:"principle",text:SEED.prinOpen[0],slot:null,replaces:null})),0.5);
  partial(add(openBase({kind:"principle",text:SEED.prinOpen[1],slot:null,replaces:prinIds[5]})),0.3);
  partial(add(openBase({kind:"principle",text:SEED.prinOpen[2],slot:null,replaces:prinIds[6]})),0.7);
  SEED.polOpen.forEach(([t,b],i)=>partial(add(openBase({kind:"policy",title:t,body:b,slot:null,replaces:null})),0.2+i*0.25));
  partial(add(openBase({kind:"plan",title:SEED.planOpen[0],body:SEED.planOpen[1],links:[polIds[SEED.planOpen[2]]],slot:null,replaces:null})),0.4);
  partial(add(openBase({kind:"office",act:"create",name:"Youth Outreach",purpose:"Campus clubs and first-time voters."})),0.6);
  partial(add(openBase({kind:"office",act:"recall",office:teamIds[1],target:leads[teamIds[1]],reason:"No meeting held since being elected."})),0.3);
  partial(add(openBase({kind:"promote",src:prinIds[3],replaces:null})),0.5);
  // write it all
  for(const id in memDocs)put("members/"+id,memDocs[id]);
  for(const id in items)put("items/"+id,items[id]);
  const stampsBefore=Object.assign({},S.stamps);
  for(const id in ballots){const cur=clean(S.votes[id]);const b=Object.assign({},cur.b||{});
    for(const i in ballots[id].b){b[i]=1;for(const w of simBallot(id,Object.assign({id:i},items[i]),ballots[id].b[i],ballots[id].bt[i],memDocs[id].cell))put(w[0],w[1])}
    put("turnout/"+id,{b})}
  S.stamps=stampsBefore;
  return writes;
}
async function runSeed(){
  const w=await seedSamples();toast("Adding "+w.length+" records…");const recs=[];
  for(const [path,doc] of w){if(!path.startsWith("ballots/"))continue;const id=path.slice(8),j=id.indexOf("_");if(!S.ballots[id])recs.push({i:id.slice(j+1),k:id.slice(0,j),v:doc.v,t:doc.t})}
  recs.sort((a,b)=>a.t-b.t);
  for(const [path,doc] of w)await enqueue(()=>S.db.doc(path).set(doc)).catch(()=>{});
  toast("Sample votes added. Sealing…");await recordVotes(recs);toast("Sample votes sealed.");
}

function pickTown(name,mode){joinSel={cell:TOWN_CELL[name],town:name};
  if(mode==="join"){render();const m=$("#join-map");if(m)m.scrollIntoView({behavior:"smooth",block:"start"})}
  else{$("#townlist").innerHTML=townButtons("mv-town");$("#mv-map").innerHTML=moveMap();$("#mv-map").scrollIntoView({behavior:"smooth",block:"center"})}}

document.addEventListener("click",e=>{
  const el=e.target.closest("[data-act]");
  if(S.ui.pick&&(!el||!["pick","tut-pick","cast"].includes(el.dataset.act))&&!(e.target.closest&&e.target.closest("#votecard"))){S.ui.pick=null;if(!el){render();return}}
  if(!el)return;if(el.disabled)return;
  if(el.getAttribute("role")==="button"&&hasSel()&&el.contains(window.getSelection().anchorNode))return;
  const a=el.dataset.act,v=el.dataset.v,id=el.dataset.id;
  switch(a){
    case"tab":if(S.ui.tab===v&&!S.ui.view)break;navMark();S.ui.coolTip=false;S.ui.tab=v;S.ui.view=null;S.ui.pick=null;if(v==="map")S.ui.gridSel=myCell();render();window.scrollTo(0,0);break;
    case"help":go({type:"help"});break;
    case"all-votes":go({type:"allvotes"});break;
    case"front":S.ui.front=v;S.ui.pick=null;render();window.scrollTo({top:0,behavior:"smooth"});break;
    case"skip":S.ui.front=null;S.ui.skip=(S.ui.skip||[]).filter(x=>x!==v).concat([v]);S.ui.pick=null;render();window.scrollTo(0,0);break;
    case"intro-next":S.ui.introStep=(S.ui.introStep||0)+1;render();window.scrollTo(0,0);break;
    case"intro-done":introDone();break;
    case"tour-start":tourGo(0);break;
    case"tour-next":tourGo(S.ui.ts+1);break;
    case"tour-back":if(S.ui.ts==null){S.ui.introStep=Math.max(0,(S.ui.introStep||0)-1);render()}else if(S.ui.ts===0){S.ui.ts=null;S.ui.tx={};render();window.scrollTo(0,0)}else tourBack();break;
    case"tx":tourAct(v,el);break;
    case"tut-pick":tutPick(v);break;
    case"intro-replay":S.ui.replay=true;S.ui.introStep=0;S.ui.ts=null;introSeen=false;S.ui.view=null;S.ui.stack=[];render();window.scrollTo(0,0);break;
    case"open-item":if(S.ui.istage)delete S.ui.istage[v];go({type:"item",id:v,from:el.dataset.from||null});break;
    case"open-team":go({type:"team",id:v});break;
    case"open-hist":S.ui.hv=null;S.ui.hmode="versions";go({type:"hist",kind:v,level:id,cell:el.dataset.cell||null});break;
    case"hv":{const pg=document.getElementById("vpage");verGo(+v,pg?+pg.dataset.k:S.ui.hv,()=>{S.ui.hv=+v});break}
    case"hmode":S.ui.hmode=v;render();break;
    case"car":if((S.ui.car[v]||0)!==+id)navMark();goCar(v,+id);break;
    case"vote-cat":navMark();S.ui.tab="vote";S.ui.view=null;S.ui.car.vote=CATS.findIndex(c=>c[0]===v);render();window.scrollTo(0,0);break;
    case"pick-scope":go({type:"scope"});break;
    case"set-scope":S.ui.plat=v;S.ui.car.plat=0;S.ui.pe={};if(S.ui.view&&S.ui.view.type==="scope")back();else render();break;
    case"open-member":S.ui.car.mem=0;go({type:"member",id:v});break;
    case"open-cast":go({type:"cast",id:v});break;
    case"back":back();break;
    case"feedback":go({type:"feedback",about:v||""});break;
    case"fb-send":sendFeedback();break;
    case"why-lock":askBox("Why the 72-hour wait?",WHY_LOCK,[["","OK",true]]);break;
    case"why-ign":askBox("Why ignore instead of block?",WHY_IGN,[["","OK",true]]);break;
    case"ign":{const on=!ignored()[v];setIgnored(v,on);toast(on?"You're ignoring "+nameOf(v)+".":"You're no longer ignoring "+nameOf(v)+".");render();break}
    case"show-ign":S.ui.showIgn=!S.ui.showIgn;C={};render();break;
    case"nmove":{const car=document.getElementById("ncar");if(!car)break;const n=car.children.length,w=Math.max(1,car.clientWidth),cur=Math.round(car.scrollLeft/w);
      const to=v[0]==="="?+v.slice(1):(cur+(+v)+n)%n;car.scrollTo({left:to*w,behavior:"smooth"});break}
    case"nhide":{const h=nHidden();h[v]=el.dataset.id;try{localStorage.setItem(NHID,JSON.stringify(h))}catch(x){}render();break}
    case"mark-read":{const t=now();if(S.members[S.me])S.members[S.me].seenAt=t;render();guard(()=>enqueue(()=>S.db.doc("members/"+S.me).update({seenAt:t})));break}
    case"grid-votes":{const f=vsState();f.sc=v===myCell()?"mine":v==="prov"?"bc":v;f.st="all";f.q="";f.n=30;navMark();S.ui.tab="search";S.ui.view=null;render();window.scrollTo(0,0);break}
    case"grid-pick":S.ui.gpq="";go({type:"gpick"});break;
    case"addr-pick":addrPick(v,el.dataset.town);break;
    case"mv-pick":{if(v===myCell())return toast("That's already your grid.");const tw=el.dataset.town||townsIn(v)[0]||"";
      askBox("Move to "+gridName(v)+"?",'<p>Moving locks your account for 72 hours: you can still look around, but you can\'t propose or vote.'+(BETA_WAIVE?' During the beta, this wait is waived.':'')+' Any lead role ends and any candidacy is withdrawn.</p>',[["go","Move",true],["no","Cancel"]]).then(k=>{if(k==="go"){joinSel={cell:v,town:tw};move()}});break}
    case"pick-grid":{if(!(S.ui.view&&S.ui.view.type==="gpick"))navMark(); // from the picker, Back skips the picker
      S.ui.plat=v===myCell()?null:v;if(v!=="prov"&&v!==myCell())S.ui.recentGrids=[v].concat((S.ui.recentGrids||[]).filter(x=>x!==v)).slice(0,6);S.ui.tab="plat";S.ui.view=null;S.ui.pe={};S.ui.amend=false;S.ui.car.plat=0;render();window.scrollTo(0,0);break}
    case"vs-sort":vsState().sort=vsState().sort==="new"?"":"new";render();break;
    case"vs-clear":{const f=vsState();f.q="";f.st="all";f.sc="all";f.n=30;render();break}
    case"vs-st":vsState().st=v;vsState().n=30;render();break;
    case"vs-more":vsState().n+=30;render();break;
    case"vfilter":{const u=el.dataset.id;S.ui.vf={uid:u,v:v.replace(/^tile-/,"")};if(el.dataset.stay){render();break}navMark();S.ui.car.mem=0;render();const c=document.getElementById("car-mem");if(c)carTop(c);break}
    case"tour-grid":{const st=tx();if(v===PRAC_CELL){st.sel=true;st.note=null}else st.note="For practice, pick the "+gridName(PRAC_CELL)+". It has the most members.";render();break}
    case"goto-grid":navMark();S.ui.tab="plat";S.ui.plat=v;S.ui.view=null;S.ui.pe={};S.ui.amend=false;S.ui.pick=null;if(S.ui.car)S.ui.car.plat=0;render();window.scrollTo(0,0);break;
    case"plat-cell":S.ui.plat=v;S.ui.pe={};S.ui.amend=false;render();break;
    case"pe":peAct(v,el);break;
    case"amend":S.ui.amend=!S.ui.amend;S.ui.pe={};render();break;
    case"open-card":if(el.dataset.dragged)break;if(!window.getSelection||!String(window.getSelection())){go({type:"item",id:v})}break;
    case"istage":S.ui.istage=Object.assign({},S.ui.istage,{[v]:"ballot"});render();window.scrollTo(0,0);break;
    case"pick":if(S.ui.pick&&S.ui.pick.id===id&&S.ui.pick.v===v)cast(id,v);else{S.ui.pick={id,v};render()}break;
    case"cast":cast(id,v);break;
    case"propose":go({type:"form",form:"propose",kind:v});break;
    case"submit-propose":submitPropose();break;
    case"promote":go({type:"form",form:"promote",id});break;
    case"submit-promote":submitPromote(id);break;
    case"team-form":go({type:"form",form:"team",act:v,id:id||null});break;
    case"submit-team":submitTeam(v,id||null);break;
    case"meeting-form":go({type:"form",form:"meeting",id});break;
    case"submit-meeting":submitMeeting(id);break;
    case"cancel-form":joinSel=null;joinFilter="";done();break;
    case"end-now":if(!DEMO())break;guard(()=>enqueue(()=>S.db.doc("ends/"+id).set({closes:now(),test:true})),"Ended.");break;
    case"stand":stand(id);break;
    case"resign":resign(id);break;
    case"start-election":startElection(id,v||null);break;
    case"grid-cell":S.ui.gridSel=v;render();break;
    case"pick-town":pickTown(v,"join");break;
    case"pick-cell":joinSel={cell:v,town:townsIn(v)[0]||""};render();break;
    case"join":join();break;
    case"move-form":joinSel=null;S.ui.gpq="";go({type:"gpick",mode:"move"});break;
    case"mv-town":pickTown(v,"move");break;
    case"mv-cell":joinSel={cell:v,town:townsIn(v)[0]||""};$("#mv-map").innerHTML=moveMap();break;
    case"submit-move":move();break;
    case"save-cfg":if(!DEMO())break;saveCfg();break;
    case"sim-add":if(!DEMO())break;simAdd(v);break;
    case"sim-vote":if(!DEMO())break;simVote();break;
    case"sim-clear":if(!DEMO())break;simClear();break;
    case"seed":if(!DEMO())break;runSeed();break;
    case"open-record":go({type:"chain"});break;
    case"rec-check":maybeVerify(true);render();break;
    case"rec-dl":recDownload();break;
    case"tamper-rec":if(!DEMO())break;tamperRecord();break;
    case"tamper-count":if(!DEMO())break;tamperCount();break;
    case"rec-clear":if(!DEMO())break;clearRecord();break;
  }
});
document.addEventListener("input",e=>{
  const t=e.target;
  if(t.id==="gp-q"){S.ui.gpq=t.value;const r=$("#gp-res");if(r){r.innerHTML=gpResults(S.ui.view&&S.ui.view.mode==="move"?"move":"view");fixMapLabels()}clearTimeout(gpT);gpT=setTimeout(()=>{const m=$("#gp-miss");if(m)m.hidden=false},1000);return}
  if(t.id==="vs-q"){vsState().q=t.value;vsState().n=30;const r=$("#vs-res");if(r)r.innerHTML=vsResults();return}
  if(t.id==="addr-q"){addrSet(t.value);return}
  if(t.id==="town-q"){joinFilter=t.value;const l=$("#townlist");if(l)l.innerHTML=townButtons(S.ui.view&&S.ui.view.form==="move"?"mv-town":"pick-town")}
  if(t.id==="pl-in"){const g=document.getElementById("pl-go");if(g)g.disabled=!t.value.trim()||norm(t.value)===norm(t.dataset.orig||"");const st=S.ui.ts!=null?tx():(S.ui.pe||{});st.val=t.value}
  {const c=t.parentNode&&t.parentNode.querySelector&&t.parentNode.querySelector(".cleft");if(c&&(t.id==="tx-in"||t.id==="pl-in")){const n=t.value.length;c.textContent=n+"/"+LIM.principle;c.hidden=n<LIM.principle-15;c.classList.toggle("low",n>=LIM.principle-5)}}
  if(t.id==="tx-in"||t.id==="pl-in")autoSizeTA();
  if(t.id==="tx-in"){const g=document.getElementById("tx-go");if(g&&g.dataset.v==="first-go"){tx().typed=t.value;g.disabled=!norm(t.value)}else if(g)g.disabled=!t.value.trim()||(g.dataset.v==="edit-go"&&t.value.trim()===t.defaultValue.trim())}
  const c=document.querySelector('.count[data-for="'+t.id+'"]');if(c)updCount(c);
});
document.addEventListener("change",e=>{if(e.target.id==="vs-sc"){vsState().sc=e.target.value;vsState().n=30;render();return}if(e.target.name==="slot"){document.querySelectorAll("#slotopts .opt").forEach(l=>l.classList.toggle("on",l.querySelector("input").checked))}else if(e.target.name==="links"){e.target.closest(".opt").classList.toggle("on",e.target.checked)}});
function updCount(c){const i=document.getElementById(c.dataset.for);const n=i?i.value.length:0,max=+c.dataset.max;c.textContent=n+" / "+max;c.className="count"+(n>max?" over":"")}
new MutationObserver(()=>document.querySelectorAll(".count[data-for]").forEach(updCount)).observe(document.getElementById("app"),{childList:true});

// ---------- names ----------
let nameBusy=false;
async function resolveNames(){if(!S.user||nameBusy)return;const ids=new Set();Object.values(S.items).forEach(i=>{ids.add(i.by);if(i.target)ids.add(i.target)});Object.keys(S.members).forEach(id=>{if(!S.members[id].sim)ids.add(id)});const need=[...ids].filter(id=>id&&!S.names[id]&&!(S.members[id]&&S.members[id].sim));if(!need.length)return;nameBusy=true;try{const ps=await S.user.profiles(need);need.forEach(id=>{S.names[id]=(ps&&ps[id])||{name:""}})}catch(e){need.forEach(id=>S.names[id]={name:""})}nameBusy=false;softRender()}

// recount once per burst of changes, not once per record
let refreshT=null;function refresh(){if(refreshT)return;refreshT=setTimeout(()=>{refreshT=null;C={};if((S.loaded||{}).rawItems)rebuildItems();softRender()},20)}
// ---------- boot ----------
async function boot(){
  const c=window.claude;
  const [db,user,voter]=await Promise.all([c&&c.use?c.use("db"):null,c&&c.use?c.use("user"):null,c&&c.use?c.use("voter").catch(()=>null):null]);
  S.db=db;S.user=user;S.voter=voter||null;
  if(user){try{S.me=await user.id();S.isOwner=await user.isOwner();S.canWrite=await user.can("data.write");if(S.canWrite===false)S.readOnly=true}catch(e){}}
  S.ready=true;
  if(!db||!S.me){render();return}
  const last={};const sub=(path,key)=>db.collection(path).onSnapshot(s=>{(S.loaded=S.loaded||{})[key]=true;const o={};s.docs.forEach(d=>{o[d.id]=Object.assign({},d.data(),{id:d.id})});const j=JSON.stringify(o);if(last[key]===j)return;last[key]=j;S[key]=o;S.rev=S.rev||{};S.rev[key]=(S.rev[key]||0)+1;C={};if(key==="meets")S.odocs=meetingsByOffice();refresh()},()=>{});
  sub("members","members");sub("turnout","votes");sub("ballots","ballots");sub("stamps","stamps");sub("items","rawItems");sub("ends","ends");sub("meetings","meets");sub("chain","chain");
  db.doc("config/settings").onSnapshot(s=>{(S.loaded=S.loaded||{}).cfg=true;if(s.exists&&DEMO()){const d=s.data();const num=(x,dflt)=>x==null||isNaN(Number(x))?dflt:Number(x);S.cfg={hours:num(d.hours,168)||168,minVoters:num(d.minVoters,5)||5,penalty:num(d.penalty,72),probation:num(d.probation,0)}}refresh()},()=>{});
  render();
  setInterval(()=>{if(S.loaded.rawItems)rebuildItems();softRender();flushTurnout()},30000);setTimeout(flushTurnout,3000); // votes that close in the meantime can open BC-wide ones
}
// while typing: the tab bar steps aside, and the editor (with its Propose button) stays above the keyboard
const isField=t=>t&&t.matches&&t.matches("textarea,input:not([type]),input[type=text],input[type=search]");
// the text box sits fully visible under the sticky header (and the sticky tab bar or tour tip), and its button just
// above the keyboard; if both don't fit, the text box wins and the button follows right under it
function keepVisible(){const a=document.activeElement;if(!isField(a))return;const box=a.closest(".pfocus");const vv=window.visualViewport;
  const bottom=(vv?vv.offsetTop+vv.height:window.innerHeight)-8;const hd=document.querySelector(".hdr");let top=(hd?hd.offsetHeight:0)+8;
  const car=a.closest(".car");const pills=car&&car.previousElementSibling;if(pills&&pills.classList.contains("pills"))top+=pills.offsetHeight;
  const th=document.querySelector(".tuthead");if(th)top+=th.offsetHeight;
  const fr=a.getBoundingClientRect();const btn=box&&box.querySelector(".btn.pri");const br=btn?btn.getBoundingClientRect():fr;
  let d=0;if(br.bottom>bottom)d=br.bottom-bottom;if(fr.top-d<top)d=fr.top-top;if(Math.abs(d)>2)window.scrollBy(0,d)}
document.addEventListener("focusin",e=>{if(!isField(e.target))return;document.body.classList.add("typing");setTimeout(keepVisible,350);setTimeout(keepVisible,800)});
document.addEventListener("focusout",e=>{if(!isField(e.target))return;setTimeout(()=>{if(!isField(document.activeElement))document.body.classList.remove("typing")},150)});
if(window.visualViewport)window.visualViewport.addEventListener("resize",()=>{if(document.body.classList.contains("typing"))keepVisible()});
window.addEventListener("resize",()=>{document.querySelectorAll(".car").forEach(c=>fitCar(c,S.ui.car[c.dataset.name]||0));fitTitle()},{passive:true});
document.addEventListener("keydown",e=>{if(e.key!=="Enter")return;const t=e.target;
  if(t.id==="addr-q"){e.preventDefault();addrSet(t.value,true)}
  if(t.id==="gp-q"){e.preventDefault();const m=$("#gp-miss");if(m)m.hidden=false;t.blur()}});
// the phone's Back button goes back inside the app; only from a top-level tab with nothing to go back to does it leave
(function(){const A=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.App;
  const ov=()=>!!(window.CPAccount&&window.CPAccount.closeBackable&&window.CPAccount.closeBackable());
  if(A&&A.addListener){A.addListener("backButton",()=>{if(S.ui.frozen)return;if(ov())return;if(!introSeen&&S.ui.ts!=null){tourBack();return}if(canBack())back();else A.exitApp()});return}
  try{history.replaceState({cp:0},"");history.pushState({cp:1},"")}catch(e){return}
  window.addEventListener("popstate",()=>{if(S.ui.frozen||ov()){history.pushState({cp:1},"");return}if(canBack()){back();history.pushState({cp:1},"")}else history.back()})})();
boot();
})();
