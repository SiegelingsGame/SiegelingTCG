// Run SiegeLandTest first to export server-owned map/catalog fixtures.
// PLAYWRIGHT_MODULE may point at the installed runtime on Windows.
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const ROOT=path.resolve(__dirname,'..'),STATIC=path.join(ROOT,'src/main/resources/static');
const OUT=path.join(ROOT,'output/lands'),PORT=Number(process.env.LANDS_PORT||8964);
const catalog=JSON.parse(fs.readFileSync(path.join(OUT,'catalog.json'),'utf8'));
const fixture=JSON.parse(fs.readFileSync(path.join(OUT,'map-fixture.json'),'utf8'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.json':'application/json'};
function server(){return http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/lands-fixture.js'){
    res.setHeader('Content-Type','text/javascript');res.end(`(${inject.toString()})(${JSON.stringify(fixture)},${JSON.stringify(catalog)});`);return;
  }
  const file=path.resolve(STATIC,'.'+(u.pathname==='/'?'/adventure.html':u.pathname));
  if(!file.startsWith(STATIC+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  let body=fs.readFileSync(file);
  if(path.extname(file)==='.html') body=body.toString().replace('<head>','<head><script src="/lands-fixture.js"></script>');
  res.end(body);
});}
function inject(fixture,catalog){
  let run=JSON.parse(JSON.stringify(fixture));
  const params=new URLSearchParams(location.search),id=params.get('land')||'fire';
  run.land=catalog.find(l=>l.id===id)||catalog[0];
  run.landHistory=[run.land];run.landSegment=0;run.currentNodeId=-1;
  if(params.has('second')){run.landSegment=1;run.currentNodeId=run.map.find(n=>n.row===7).id;}
  run.map.forEach(n=>{n.reachable=n.row===run.landSegment*8;n.current=n.id===run.currentNodeId;n.cleared=n.row<run.landSegment*8;});
  run.boonOffer=null;
  if(params.has('boon')){run.boonSource='BADLANDS';run.boonOffer=[{id:'riskrunner',name:'Riskrunner',icon:'⚡',desc:'When enemies act first in round 1, gain +2 AP. In Badlands: +3 AP.'}];run.map.forEach(n=>n.reachable=false);}
  window.__landCalls=[];
  localStorage.setItem('siegeToken',run.token);
  const original=window.fetch;
  window.fetch=(url,opts)=>{
    if(!String(url).includes('/api/siege/'))return original(url,opts);
    const body=opts&&opts.body?JSON.parse(opts.body):{};
    window.__landCalls.push({url:String(url),body});
    let data=run;
    if(String(url).includes('/run/active'))data={runs:[run]};
    if(String(url).includes('/battlegrounds/boon')){run.landBoons=run.boonOffer;run.boonOffer=null;run.map.forEach(n=>n.reachable=n.row===0);}
    if(String(url).includes('/node/enter')){run.currentNodeId=body.nodeId;run.map.forEach(n=>n.current=n.id===body.nodeId);}
    return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve(JSON.parse(JSON.stringify(data)))});
  };
}
async function main(){
  const srv=server();await new Promise(r=>srv.listen(PORT,'127.0.0.1',r));
  if(process.argv.includes('--serve')){console.log(`Lands preview at http://127.0.0.1:${PORT}/adventure.html?land=fire`);return;}
  const browser=await chromium.launch({headless:true});const results=[];
  try{
    const viewports=[{width:390,height:844},{width:320,height:568},{width:844,height:390},{width:1920,height:1080}];
    for(const vp of viewports){
      for(const land of catalog){
        const page=await browser.newPage({viewport:vp});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
        await page.goto(`http://127.0.0.1:${PORT}/adventure.html?land=${land.id}`,{waitUntil:'load'});
        await page.locator('#resumeSaves .siege-btn.primary').click();await page.locator('#mapLand').waitFor();await page.waitForTimeout(120);
        const state=JSON.parse(await page.evaluate(()=>window.render_game_to_text()));assert.equal(state.land.id,land.id);
        assert.equal(await page.locator('.map-node-g.type-BOSS').count(),1);
        const probe=await page.evaluate(async()=>{
          const art=getComputedStyle(document.getElementById('mapScroll')).backgroundImage;
          const url=art.match(/url\("?([^"\)]+)/)[1];
          const image=new Image();image.src=url;await image.decode();
          const targets=['mapLand','inventoryBtn','mapKeyBtn'];
          return {art,width:image.naturalWidth,overflow:document.documentElement.scrollWidth>innerWidth,
            targets:targets.map(id=>{const el=document.getElementById(id),r=el.getBoundingClientRect();return {id,visible:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})};
        });
        assert(probe.width>=1000);assert(!probe.overflow,JSON.stringify(probe));
        probe.targets.forEach(t=>assert(t.visible&&t.hit,`${vp.width} ${land.id} ${JSON.stringify(t)}`));
        await page.screenshot({path:path.join(OUT,`${land.id}-${vp.width}.png`)});
        await page.locator('#mapLand').click();assert(await page.locator('#landDetails').textContent().then(t=>t.includes(land.effect)));
        await page.keyboard.press('Escape');assert(await page.locator('#landModal').evaluate(e=>e.classList.contains('hidden')));
        const node=page.locator('.map-node-g.reachable').first();await node.evaluate(e=>e.scrollIntoView({block:'center',inline:'center'}));await node.focus();await page.keyboard.press('Enter');
        await page.waitForTimeout(60);assert(await page.evaluate(()=>window.__landCalls.some(c=>c.url.includes('/node/enter'))));
        assert.deepEqual(errors,[]);results.push({land:land.id,viewport:vp,passed:true});await page.close();
      }
    }
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.goto(`http://127.0.0.1:${PORT}/adventure.html?land=badlands&boon=1`);
    await page.locator('#resumeSaves .siege-btn.primary').click();await page.locator('.boon-choice').click();
    await page.locator('#mapLand').click();assert((await page.locator('#landDetails').textContent()).includes('Riskrunner'));
    await page.waitForTimeout(250);
    await page.screenshot({path:path.join(OUT,'badlands-details.png')});await page.locator('#landClose').click();
    await page.goto(`http://127.0.0.1:${PORT}/adventure.html?land=aurora&second=1`);await page.locator('#resumeSaves .siege-btn.primary').click();
    assert.equal(await page.locator('.map-node-g.type-BOSS').count(),1);
    assert((await page.locator('#mapLand').textContent()).includes('LAND 2'));
    await page.setViewportSize({width:844,height:390});await page.waitForTimeout(200);
    const readable=await page.locator('#mapSvg').evaluate(e=>e.width.baseVal.value>e.height.baseVal.value);assert(readable);
    await page.screenshot({path:path.join(OUT,'second-land-rotated.png')});await page.close();
    fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify(results,null,2));console.log(`${results.length} land/viewport cases plus boon and rotation flows passed`);
  }finally{await browser.close();srv.close();}
}
main().catch(e=>{console.error(e);process.exit(1);});
