import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto, createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../caption-status.js',import.meta.url),'utf8');
const video='dQw4w9WgXcQ', text='fixture subtitles';
const hash=createHash('sha256').update(text).digest('hex');
function context(bridge) {
  const box={crypto:webcrypto,TextEncoder,Uint8Array,setTimeout:fn=>fn()};
  box.window=box;box.TapBridge=bridge;vm.runInNewContext(source,box);
  return box.TapYouTubeCaptionStatus;
}
assert.equal(await context(null)(video,text),'unavailable');
let calls=0;
assert.equal(await context({isReady:()=>false, request:()=>{calls++;}})(video,text),'unavailable');
assert.equal(calls,0);
assert.equal(await context({isReady:()=>true, request:async(name,args)=>{
  assert.equal(name,'youtube.subtitle-status');assert.equal(args.sha256,hash);
  assert.equal(args.videoId,video);return {saved:true,videoId:video,sha256:hash};
}})(video,text),'saved');
assert.equal(await context({isReady:()=>true,request:async()=>({saved:true,videoId:video,sha256:'0'.repeat(64)})})(video,text),'unconfirmed');
assert.equal(await context({isReady:()=>true,request:async()=>{throw Error('disconnected');}})(video,text),'unavailable');
calls=0;
assert.equal(await context({isReady:()=>true,request:async()=>{calls++;return {saved:calls===3,videoId:video,sha256:hash};}})(video,text),'saved');
assert.equal(calls,3);
calls=0;
assert.equal(await context({isReady:()=>true,request:async()=>{calls++;return {saved:false};}})(video,text),'unconfirmed');
assert.equal(calls,8);
console.log('7 caption confirmation scenarios passed');
