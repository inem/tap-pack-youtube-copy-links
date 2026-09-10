// Real Chromium + packaged page sources on a synthetic YouTube-shaped document.
// HTTP and receipt replies are fixtures; real installed WS is checked separately.
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const {chromium}=require(process.argv[2]);
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:process.argv[3],headless:true});
 const checks=[];
 try {
  for(const mode of ['off','connected','disconnected','empty','unavailable']) {
   const ctx=await browser.newContext();
   let fetches=0;
   await ctx.route('**/*',route=>{
    if(route.request().url().includes('/api/timedtext')) {fetches++;return route.fulfill({contentType:'text/xml',body:mode==='empty'?'':'<transcript><text>Fixture</text></transcript>'});}
    return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="en"><body><ytd-app><ytd-watch-flexy><ytd-watch-metadata><h1>Fixture</h1><div id="actions"><div id="top-level-buttons-computed"></div></div></ytd-watch-metadata></ytd-watch-flexy></ytd-app></body></html>'});
   });
   const page=await ctx.newPage();await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
   await page.evaluate(mode=>{
    window.fixtureCopies=[];window.fixtureReceipts=0;
    Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.fixtureCopies.push(text)},configurable:true});
    window.ytInitialPlayerResponse={videoDetails:{videoId:'dQw4w9WgXcQ'},captions:{playerCaptionsTracklistRenderer:{captionTracks:mode==='unavailable'?[]:[{languageCode:'en',baseUrl:'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=en'}]}}};
    if(mode!=='off') window.TapBridge={isReady:()=>true,request:async(name,args)=>{
     window.fixtureReceipts++;
     if(mode==='disconnected') throw Error('disconnected');
     return {saved:true,videoId:args.videoId,sha256:args.sha256};
    }};
   },mode);
   for(const name of ['youtube-ui.js','caption-status.js','copy-links.js']) await page.addScriptTag({content:fs.readFileSync(path.join(root,name),'utf8')});
   await page.getByRole('button',{name:'Copy video URL https://youtu.be/dQw4w9WgXcQ',exact:true}).click();
   await page.waitForFunction(mode=>{
    const req=window.__tapYoutubeCopyLinks.lastCaptionRequest;
    return req && (mode==='empty'?req.status==='failed':mode==='unavailable'?req.status==='unavailable':req.local===(mode==='connected'?'saved':'unavailable'));
   },mode);
   const result=await page.evaluate(()=>({copies:fixtureCopies,receipts:fixtureReceipts,request:__tapYoutubeCopyLinks.lastCaptionRequest,text:document.body.textContent}));
   assert.deepEqual(result.copies,['https://youtu.be/dQw4w9WgXcQ']);
   assert.equal(fetches,mode==='unavailable'?0:1);
   if(['off','empty','unavailable'].includes(mode))assert.equal(result.receipts,0);
   if(mode==='connected')assert(result.text.includes('Subtitles saved locally'));
   assert.notEqual(result.request.status,'captured');
   checks.push({mode,copy:true,caption_requests:fetches,local:result.request.local||null,status:result.request.status});
   await ctx.close();
  }
  console.log(JSON.stringify({scope:'synthetic DOM and HTTP/WS responses; real Chrome, source scripts',browser:browser.version(),passed:true,checks},null,2));
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
