'use strict';
// Full manifest / no-persistent-storage integration. Transport uses the actual
// packaged bytes on disk; this is NOT a browser, network-speed or GPU benchmark.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const {create: createAssets} = require('../dist/native-assets.js');
const {create: createPreload} = require('../dist/native-preload.js');

function events(extra = {}) {
  const handlers = new Map();
  return Object.assign(extra, {
    addEventListener(name, fn) { if(!handlers.has(name))handlers.set(name,new Set()); handlers.get(name).add(fn); },
    removeEventListener(name, fn) { handlers.get(name)?.delete(fn); }
  });
}

async function main() {
  const runtime = path.resolve(__dirname, '../dist/native-vc/runtime');
  const requests = new Map(); let active = 0, peak = 0;
  const doc = events({currentScript:{src:'https://cold-fixture.test/native-assets.js'},hidden:false,visibilityState:'visible',querySelectorAll:()=>[]});
  const root = events({document:doc,navigator:{onLine:true},location:{href:'https://cold-fixture.test/'},crypto:webcrypto,AbortController,Response,
    setTimeout,clearTimeout,Date,
    caches:{open:async()=>{throw Object.assign(new Error('fixture: storage denied'),{name:'SecurityError'});}},
    fetch:async(url,options)=>{
      assert.equal(options.signal.aborted,false);
      const relative = new URL(url).pathname.replace(/^\/native-vc\/runtime\//,'');
      const filename = path.resolve(runtime,relative); assert(filename.startsWith(runtime+path.sep));
      requests.set(String(url),(requests.get(String(url))||0)+1);
      active++;peak=Math.max(peak,active);
      try{return new Response(await fs.readFile(filename));}finally{active--;}
    }
  });
  const assets = createAssets(root); root.GTANativeAssets = assets;
  const scheduler = Object.assign({},root,{setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,1))});
  const preload = createPreload(scheduler,assets);
  const stateHistory = [];
  let done;
  const terminal = new Promise((resolve,reject)=>{
    done = preload.subscribe(state=>{
      stateHistory.push({status:state.status,bytes:state.loadedBytes});
      if(state.status==='complete')resolve(state);
      else if(state.status==='unavailable')reject(new Error('Preparation stopped: '+state.reason));
    });
  });
  preload.setContext({screen:'home',entryReady:true,active:true,eager:true});
  const timer=setTimeout(()=>{console.error('Full-manifest preparation timed out');process.exit(1);},30000);
  const prepared=await terminal;
  const manifest=await assets.loadManifest(), district=await assets.loadDistrictManifest();
  const files=[manifest.engine.js,manifest.engine.wasm,manifest.data,...manifest.models.files,...district.files];
  const snapshot=assets.preparedSnapshot(files), before=requests.size;
  assert.equal(prepared.cacheAvailable,false);assert.equal(prepared.preparedAvailable,true);
  assert.equal(snapshot.loadedBytes,snapshot.totalBytes);assert.equal(prepared.loadedBytes,snapshot.totalBytes);
  assert.equal(peak,1,'Only one transport request at a time');
  assert.equal(Math.max(...requests.values()),1,'No chunk restarted');
  let assembled=0;
  // The warm iframe reuses this parent service, so cache-only reads assemble
  // the real logical packages from the same privately retained leaves.
  for(const file of files){
    const bytes=await assets.getAsset(file,{priority:'low',cacheOnly:true});
    assert.equal(bytes.byteLength,file.size);assembled+=bytes.byteLength;
  }
  assert.equal(requests.size,before,'Opening C fetched no additional runtime leaves');
  const retained=await assets.cachedStats(); assets.releaseSession();
  const after=await assets.cachedStats();assert.equal(after.sessionBytes,0);
  for(let i=1;i<stateHistory.length;i++)assert(stateHistory[i].bytes>=stateHistory[i-1].bytes);
  done();preload.destroy();clearTimeout(timer);
  const report={scope:'Actual packaged manifest and bytes via local-file transport; scheduler delays compressed; no browser, real-network speed or GPU execution.',
    persistentStorage:'denied',preparedBytes:prepared.loadedBytes,totalBytes:snapshot.totalBytes,
    logicalResources:files.length,requests:requests.size,duplicateRequests:0,peakTransportRequests:peak,
    retainedSessionFiles:retained.sessionFiles,retainedSessionBytes:retained.sessionBytes,
    allLogicalResourcesAssembledAndSHAVerified:true,assembledBytes:assembled,additionalRuntimeDownloadsAtHandoff:0,
    sessionBytesAfterRelease:after.sessionBytes,progressMonotonic:true,nativeGPUExecuted:false};
  await fs.writeFile(path.resolve(__dirname,'../qa-rc47-first-load.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
