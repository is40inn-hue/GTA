/* GTA EGE · 0.5.2 / real VC-WASM in-game exam cutscene.
   This iframe has its own isolated WASM instance and SCM. The production
   practice C instance never receives this classroom's models or globals. */
(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const canvas=$('canvas'), status=$('status'), label=$('status-label'), bar=$('bar');
  const baseURL=new URL('runtime/',location.href), aborter=new AbortController();
  let disposed=false, started=false, frames=0, mainAt=0, ready=false, scriptURL=null;
  let manifest=null, options=null, lastError='';
  function notify(type,data={}) { if(parent!==window) parent.postMessage({type:'ege:intro:'+type,...data},location.origin); }
  function setStatus(text,progress) {
    label.textContent=text;
    if(Number.isFinite(progress))bar.style.width=Math.max(0,Math.min(100,progress)).toFixed(0)+'%';
    notify('progress',{text,percent:Number.isFinite(progress)?Math.round(progress):null});
  }
  function fail(error){
    if(disposed)return;
    lastError=String(error?.message||error||'Неизвестная ошибка').slice(0,190);
    console.warn('[EGE native intro]',error);
    status.hidden=false;setStatus('Сцена недоступна: можно перейти прямо к экзамену',0);
    notify('error',{message:lastError});
  }
  function dispose(){disposed=true;aborter.abort();if(scriptURL){URL.revokeObjectURL(scriptURL);scriptURL=null;}}
  addEventListener('pagehide',dispose,{once:true});
  function enter(){
    const args={bubbles:true,key:'Enter',code:'Enter',which:13,keyCode:13};
    document.dispatchEvent(new KeyboardEvent('keydown',args));
    setTimeout(()=>{if(!disposed)document.dispatchEvent(new KeyboardEvent('keyup',args));},220);
  }
  function installAudioRouting(){
    const mapping=new Map((manifest.audio?.files||[]).map(f=>[f.originalPath,f.path]));
    const open=XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open=function(method,input,...args){
      let url=String(input),path=null;
      if(url.startsWith('https://cdn.dos.zone/vcsky/fetched/'))path='/remote/'+url.slice('https://cdn.dos.zone/vcsky/fetched/'.length).replaceAll('\\','/').toLowerCase();
      else if(url.startsWith('/remote/'))path=url.split(/[?#]/,1)[0];
      if(path?.startsWith('/remote/models/'))url=new URL(path.slice(1),baseURL).href;
      if(path?.startsWith('/remote/audio/'))url=new URL(mapping.get(path)||manifest.audio.fallback.path,baseURL).href;
      return open.call(this,method,url,...args);
    };
  }
  async function verify(bytes,expected){
    const b=await crypto.subtle.digest('SHA-256',bytes);
    const checksum=Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
    if(checksum!==expected)throw new Error('Native cutscene integrity error');
  }
  async function start(){
    if(started)return;started=true;
    try{
      const probe=document.createElement('canvas');
      const gl=probe.getContext('webgl2',{alpha:false,depth:true,stencil:true,antialias:false});
      if(!gl)throw new Error('WebGL 2 не поддерживается устройством');
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      const assets=(()=>{try{return parent!==window&&parent.GTANativeAssets||window.GTANativeAssets;}catch{return window.GTANativeAssets;}})();
      if(!assets||typeof window.GTAExamClassroomModels?.install!=='function')throw new Error('Native loader is unavailable');
      manifest=await assets.loadManifest({signal:aborter.signal});
      const contractResponse=await fetch('intro-assets/intro-contract.json',{signal:aborter.signal});
      if(!contractResponse.ok)throw new Error('Missing native cutscene contract');
      const contract=await contractResponse.json();
      if(contract.nativeEngine!=='shipped Vice City WASM'||contract.teacherPedId!==67||contract.roomDffId!==5035)throw new Error('Invalid cutscene contract');
      const extraFiles=window.GTAExamClassroomModels.files;
      const [iniResponse,scmResponse,...extraResponses]=await Promise.all([
        fetch('revc.ini',{signal:aborter.signal}),fetch('intro-assets/intro.scm',{signal:aborter.signal}),
        ...extraFiles.map(f=>fetch('intro-assets/'+f.name,{signal:aborter.signal}))
      ]);
      if(!iniResponse.ok||!scmResponse.ok||extraResponses.some(r=>!r.ok))throw new Error('Native cutscene resource unavailable');
      const scene=new Uint8Array(await scmResponse.arrayBuffer()), ini=new TextEncoder().encode(await iniResponse.text());
      if(scene.byteLength!==contract.size)throw new Error('Invalid cutscene byte size');
      await verify(scene.buffer,contract.sha256);
      const models={};for(let i=0;i<extraFiles.length;i++)models[extraFiles[i].name]=new Uint8Array(await extraResponses[i].arrayBuffer());
      const files=manifest.models?.files||[];
      if(files.length<40)throw new Error('Native VC model package missing');
      const total=manifest.data.size+manifest.engine.js.size+manifest.engine.wasm.size+manifest.models.size;
      let loaded=new Map();const onBytes=e=>{
        const prev=loaded.get(e.path)||0;loaded.set(e.path,Math.max(prev,e.loaded));
        const num=Array.from(loaded.values()).reduce((a,b)=>a+b,0);
        setStatus('Собираем кабинет в Vice City · '+Math.round(num/1048576)+' МБ',num/total*88);
      };
      options={signal:aborter.signal,onBytes,priority:'high'};
      const [data,wasm,glue]=await Promise.all([assets.getAsset(manifest.data,options),assets.getAsset(manifest.engine.wasm,options),assets.getAsset(manifest.engine.js,options)]);
      const nativeModelFiles=[];
      for(let i=0;i<files.length;i+=4){
        if(disposed)return;
        nativeModelFiles.push(...await Promise.all(files.slice(i,i+4).map(async file=>({file,bytes:await assets.getAsset(file,options)}))));
      }
      installAudioRouting();
      setStatus('Входит экзаменатор. Готовим камеру.',94);
      window.Module={
        portraitRelativeInput:true,canvas,arguments:[],wasmBinary:wasm,getPreloadedPackage:()=>data.buffer,
        locateFile:name=>new URL(name,baseURL).href,
        onRuntimeInitialized:function(){
          try{
            for(const entry of nativeModelFiles)this.FS.writeFile('/vc-assets/local/'+entry.file.originalPath.slice('/remote/'.length),entry.bytes);
            window.GTAExamClassroomModels.install(this.FS,models);
            this.FS.writeFile('/vc-assets/local/data/main.scm',scene);
            this.FS.writeFile('/vc-assets/local/revc.ini',ini);
            notify('runtime',{modelsInstalled:true,scmSize:scene.length});
          }catch(error){fail(error);throw error;}
        },
        mainCalled:function(){mainAt=performance.now();this.FS.writeFile('/vc-assets/local/revc.ini',ini);},
        syncRevcIni:function(){},hotelMission:function(){},
        print:function(){},printErr:function(message){if(/fatal|abort|exception/i.test(String(message)))console.warn('[EGE intro engine]',message);},
        onAbort:function(reason){fail(reason);},setStatus:function(){},
        preMainLoop:function(){return !disposed;},
        postMainLoop:function(){
          if(disposed||ready)return;
          frames++;
          // The VC engine has started its own mission and has run real frames;
          // only now does the HTML narrative advance over the *native* canvas.
          if(mainAt&&frames>32&&performance.now()-mainAt>1800){ready=true;status.hidden=true;notify('ready',{engine:'vice-city-wasm',modelId:5035,teacherId:67});}
        }
      };
      const script=document.createElement('script');
      scriptURL=URL.createObjectURL(new Blob([glue],{type:'text/javascript'}));
      script.src=scriptURL;script.onload=()=>{URL.revokeObjectURL(scriptURL);scriptURL=null;};
      script.onerror=()=>fail('Vice City WASM start failed');document.body.append(script);
      // The original engine loads its own menu. Only engine-native Enter events.
      const interval=setInterval(()=>{if(disposed||ready||performance.now()-mainAt>15000){clearInterval(interval);return;}if(mainAt)enter();},2200);
    }catch(error){if(!disposed&&error.name!=='AbortError')fail(error);}
  }
  start();
})();
