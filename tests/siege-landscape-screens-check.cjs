// Landscape guard for the Siege map / event / camp / reward screens.
//
//   node tests/siege-landscape-screens-check.cjs
//
// Three regressions reported from a landscape phone, all reproduced here:
//   1. Map node labels printed over the circles of the lane below them, and the
//      map itself was a small boxed canvas with a 100px HUD block beneath it.
//   2. .location-overlay was capped at 78% of the stage, so every event/camp
//      control floated ~22vh above the bottom edge with dead art below it.
//   3. In the landscape reward rail the leveling recap ellipsed unit names down
//      to a bare "...".
// Portrait and desktop are checked alongside to prove they are untouched.
const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const ROOT=path.dirname(__dirname);
const STATIC=path.join(ROOT,'src','main','resources','static');
const OUT=process.env.OUT||path.join(ROOT,'output','web-game','siege-landscape-screens');
const PORT=8971;
const TYPES={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const ART='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="200"><ellipse cx="60" cy="100" rx="48" ry="96" fill="#7fd0a0"/></svg>');
function member(id,name,el,hp,max){return {id,name,element:el,hp,maxHp:max,alive:true,shield:0,speed:9,position:0,level:4,xpInLevel:30,xpSpan:190,artUrl:ART,cards:[],size:'MEDIUM',sourceCardId:id};}
const LABELS={BATTLE:'Skirmish',ELITE:'Elite Siege',REST:'Rest Camp',TREASURE:'Cache',EVENT:'Event',BROKER:'Broker',SMITH:'Smith',CARAVAN:'Caravan',BOSS:'Siegelord'};
const TYPESEQ=['BATTLE','REST','EVENT','TREASURE','ELITE','BROKER','SMITH','CARAVAN'];
const map=(()=>{const out=[];for(let row=0;row<9;row++){const n=row%2?3:4;for(let col=0;col<n;col++){const t=row===8?'BOSS':TYPESEQ[(row*3+col)%TYPESEQ.length];out.push({id:`n${row}-${col}`,label:LABELS[t],type:t,row,col,cleared:row<3,current:row===3&&col===1,reachable:row===4,visited:row<3,next:row===8?[]:[`n${row+1}-${Math.min(col,(row%2?3:2))}`]});}}return out;})();
const BASE={token:'t',status:'ACTIVE',gold:62,mode:'STANDARD',slot:'SIEGE',checkpoint:true,deckSize:14,
  party:[member('a1','Draco','FIRE',102,102),member('a2','Blinky','ELECTRIC',79,88),member('a3','Clawkid','FIRE',50,88)],
  knight:{id:'k1',name:'Ser Airek',element:'METAL',hp:41,maxHp:46,artUrl:ART,level:4},
  map,currentNodeId:'n3-1',inventory:[],knightBag:[],deckList:[],items:[]};
const EVENT=Object.assign({},BASE,{event:{icon:'🔮',title:'Wandering Oracle',prompt:'An oracle reads the threads of fate for a fee.',options:[{id:'p',title:'Pay 15 for a blessing',desc:'Foresight quickens your warband.',affordable:true},{id:'n',title:'Ask nothing',desc:'You trust your own path.',affordable:true}]}});
const xpUnit=(name,el,kind,lb,la,gain,bonus,inLevel,span)=>({name,element:el,kind,levelBefore:lb,levelAfter:la,leveledUp:la>lb,xpGained:gain,killBonus:bonus,xpInLevel:inLevel,xpSpan:span});
const REWARD=Object.assign({},BASE,{lastReward:'Victory!',xpRecap:{totalAwarded:125,units:[
  xpUnit('Draco the Emberwing','FIRE','SIEGELING',4,5,35,10,30,190),
  xpUnit('Blinky','ELECTRIC','SIEGELING',4,4,25,0,95,140),
  xpUnit('Clawkid Skitterclaw','WATER','SIEGELING',3,4,45,20,10,140),
  xpUnit('Ser Airek Stonewarden','METAL','KNIGHT',4,4,25,0,120,140)]},
  pendingRewards:[{id:'r1',kind:'CARD',title:'Measured Blow',element:'NEUTRAL',desc:'A universal technique any Siegeling can learn. · learned by Clawkid',cardMeta:'BUFF_ATK · power 1 · 2 AP'},
    {id:'r2',kind:'CARD',title:'Livewire',element:'ELECTRIC',desc:'Connected allies gain +2 Speed · learned by Blinky',cardMeta:'BUFF_SPD · power 2 · 1 AP'},
    {id:'r3',kind:'UPGRADE',title:'Upgrade Embers +',element:'FIRE',desc:'Embers + becomes Embers + + (7→9 power).'}]});
function serve(){const s=http.createServer((req,res)=>{const rel=decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'')||'adventure.html';const f=path.join(STATIC,rel);if(!f.startsWith(STATIC)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end('no');return;}res.writeHead(200,{'Content-Type':TYPES[path.extname(f)]||'application/octet-stream'});res.end(fs.readFileSync(f));});return new Promise(r=>s.listen(PORT,'127.0.0.1',()=>r(s)));}
const VPS=[{name:'land-932x430',width:932,height:430},{name:'land-844x390',width:844,height:390},{name:'portrait-390x844',width:390,height:844},{name:'desktop-1920x1080',width:1920,height:1080}];
const CAMP=Object.assign({},BASE,{camp:{title:'Rest Camp',prompt:'The fire burns low.',options:[
  {id:'c1',kind:'REST',title:'Rest by the fire',desc:'Heal the warband for 30% of max HP.',cost:0,affordable:true,element:'FIRE'},
  {id:'c2',kind:'SHOP_UPGRADE',title:'Field upgrade',desc:'Upgrade one card in the deck.',cost:25,affordable:true,element:'METAL'},
  {id:'c3',kind:'SHOP_CARD',title:'Buy a card',desc:'Add a new technique to the deck.',cost:40,affordable:true,element:'WIND'}]}});
const SCENES=[['map',BASE],['event',EVENT],['reward',REWARD],['camp',CAMP]];
function probe(){
  const vw=document.documentElement.clientWidth, vh=document.documentElement.clientHeight;
  const box=n=>{const b=n.getBoundingClientRect();return{w:Math.round(b.width),h:Math.round(b.height),left:Math.round(b.left),right:Math.round(b.right),top:Math.round(b.top),bottom:Math.round(b.bottom)};};
  const clipped=n=>n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+1;
  const out={vw,vh,screen:document.body.dataset.screen};
  const names=[...document.querySelectorAll('.xp-unit-name')].map(n=>({text:n.textContent.trim(),truncated:n.scrollWidth>n.clientWidth+1,box:box(n)}));
  if(names.length)out.xpNames=names;
  const ms=document.querySelector('.map-scroll');
  if(ms&&!ms.closest('.hidden'))out.mapScroll=box(ms);
  const mb=document.querySelector('.map-bottom');if(mb&&mb.getBoundingClientRect().height)out.mapBottom=box(mb);
  // SVG label vs neighbouring circles overlap (landscape lanes)
  const labels=[...document.querySelectorAll('.map-label')];
  const circles=[...document.querySelectorAll('.map-circle')];
  if(labels.length){let hits=0;labels.forEach(l=>{const a=l.getBoundingClientRect();circles.forEach(c=>{const b=c.getBoundingClientRect();if(a.left<b.right-2&&a.right>b.left+2&&a.top<b.bottom-2&&a.bottom>b.top+2)hits++;});});
    let lbl=0;labels.forEach((l,i)=>{const a=l.getBoundingClientRect();labels.forEach((m,j)=>{if(j<=i)return;const b=m.getBoundingClientRect();if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)lbl++;});});
    out.labelCircleOverlaps=hits;out.labelLabelOverlaps=lbl;}
  const co=document.querySelector('#campScreen .location-overlay');
  if(co&&co.getBoundingClientRect().height){const b=co.getBoundingClientRect();
    const g=document.querySelector('#campOptions')||document.querySelector('#campScreen .camp-grid');
    out.campOverlay={h:Math.round(b.height),bottom:Math.round(b.bottom)};
    if(g){const r=g.getBoundingClientRect();out.campGrid={h:Math.round(r.height),bottom:Math.round(r.bottom),top:Math.round(r.top)};}}
  const ov=document.querySelector('#eventScreen .location-overlay');
  if(ov&&ov.getBoundingClientRect().height){
    const st=document.querySelector('#eventScreen .location-stage');
    out.stage=box(st);
    out.copy=box(document.querySelector('#eventScreen .location-copy'));
    out.choices=box(document.querySelector('#eventChoices'));
    out.partyFigs=[...document.querySelectorAll('#eventParty .location-siegling')].map(box);
    out.title=box(document.getElementById('eventTitle'));
  }
  const q=(sel)=>{const n=document.querySelector(sel);if(!n)return null;const b=n.getBoundingClientRect();const cs=getComputedStyle(n);return{sel,top:Math.round(b.top),bottom:Math.round(b.bottom),h:Math.round(b.height),pos:cs.position,pad:cs.padding,disp:cs.display};};
  out.chain=['#eventScreen .location-overlay','#eventScreen .location-stage','#eventScreen','.siege-app','body','#eventScreen .location-art-wide','#rewardScreen','#mapScreen','.siege-app'].map(q).filter(Boolean);
  out.docScrollH=document.documentElement.scrollHeight;
  return out;}
(async()=>{fs.mkdirSync(OUT,{recursive:true});const server=await serve();
 const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
 const failures=[];
 for(const vp of VPS){for(const [scene,run] of SCENES){
   const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}});
   const errs=[];page.on('pageerror',e=>errs.push(String(e)));
   await page.addInitScript(r=>{localStorage.setItem('siegeToken','t');const orig=window.fetch;
     const json=v=>Promise.resolve({ok:true,status:200,json:()=>Promise.resolve(JSON.parse(JSON.stringify(v)))});
     window.fetch=(u,o)=>{const s=String(u);if(s.indexOf('/api/siege/')<0)return orig(u,o);
       if(s.indexOf('/run/active')>=0)return json({runs:[r]});return json(r);};},run);
   await page.goto(`http://127.0.0.1:${PORT}/adventure.html?v=chk`,{waitUntil:'load'});
   await page.waitForSelector('#resumeSaves .siege-btn.primary',{timeout:15000});
   await page.click('#resumeSaves .siege-btn.primary');
   await page.waitForTimeout(700);
   if(scene==='map'){await page.click('#mapKeyBtn');await page.waitForTimeout(250);
     const rows=await page.evaluate(()=>({rows:document.querySelectorAll('#legendNodes .legend-row').length,states:document.querySelectorAll('#legendStates .legend-row').length,overflow:(()=>{const b=document.querySelector('#legendOverlay .inv-body');return b.scrollHeight>b.clientHeight;})()}));
     console.log('   legend '+JSON.stringify(rows));
     await page.screenshot({path:path.join(OUT,`${vp.name}-legend.png`)});
     await page.click('#legendClose');await page.waitForTimeout(150);}
   const m=await page.evaluate(probe);
   console.log(`\n== ${vp.name} / ${scene}`);
   const check=(c,msg)=>{if(!c)failures.push(`[${vp.name}/${scene}] ${msg}`);};
   check(errs.length===0,'page errors: '+errs.slice(0,2).join(' | '));
   if(scene==='map'){
     console.log(`   label/circle overlaps=${m.labelCircleOverlaps} label/label=${m.labelLabelOverlaps} mapScroll=${JSON.stringify(m.mapScroll)}`);
     check(m.labelCircleOverlaps===0,`node labels overlap ${m.labelCircleOverlaps} circles`);
     check(m.labelLabelOverlaps===0,'node labels overlap each other');
     if(vp.height<=600&&vp.width>vp.height){
       check(m.mapScroll.top<=0&&m.mapScroll.left<=0&&m.mapScroll.right>=m.vw&&m.mapScroll.bottom>=m.vh,
         'landscape: the map canvas is full-bleed');
       check(m.mapBottom.bottom>=m.vh-1&&m.mapBottom.h<=88,
         `landscape: the HUD floats at the bottom edge as one slim row (got ${m.mapBottom.h}px)`);
     }
   }
   if(scene==='event'||scene==='camp'){
     const ov=scene==='event'?m.choices:m.campGrid;
     console.log(`   stage/overlay bottom=${m.vh} controls bottom=${ov&&ov.bottom}`);
     // Portrait stacks an actions row (e.g. Break Camp) under the grid, so only
     // landscape — where the 78% cap did the lifting — pins the grid itself.
     const slack=(vp.height<=600&&vp.width>vp.height)?40:70;
     check(ov&&ov.bottom>=m.vh-slack,`the ${scene} controls sit on the bottom edge (bottom ${ov&&ov.bottom} of ${m.vh})`);
   }
   if(scene==='reward'){
     console.log('   names: '+m.xpNames.map(n=>n.text+(n.truncated?' [CUT]':'')).join(' | '));
     check(m.xpNames.every(n=>!n.truncated),'a recap unit name is truncated');
   }
   await page.screenshot({path:path.join(OUT,`${vp.name}-${scene}.png`)});
   await page.close();
 }}
 await browser.close();server.close();
 if(failures.length){console.log('\nFAILURES:\n - '+failures.join('\n - '));process.exit(1);}
 console.log('\nAll landscape screen checks passed.');})();
