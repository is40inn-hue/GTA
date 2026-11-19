/* Original Ocean Drive. Install before native main, never relocate its path network. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GTAExamViceDistrict=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const FS_ROOT='/vc-assets/local/';
const sceneDat=[
'# Original Ocean Drive / EGE edition 10',
'IDE DATA\\MAPS\\generic.IDE','IDE DATA\\MAPS\\oceandrv\\oceandrv.IDE',
'COLFILE 0 MODELS\\COLL\\GENERIC.COL','COLFILE 0 DATA\\MAPS\\oceandrv\\oceandrv.COL',
'IPL DATA\\MAP.ZON','IPL DATA\\NAVIG.ZON','IPL DATA\\INFO.ZON',
'IPL DATA\\MAPS\\oceandrv\\oceandrv.IPL','IPL DATA\\MAPS\\paths.IPL','IPL DATA\\occlu.IPL',''
].join('\n');
// Candidate design points. Grounding/collision and reachability need native QA before release.
const points={spawn:{x:278,y:-1065,z:11.5},targetCar:{x:291,y:-1090,z:11.2},escapeCar:{x:287,y:-1100,z:11.2},chase:[{x:290,y:-1100,z:11},{x:272,y:-1190,z:11},{x:253,y:-1270,z:11},{x:233,y:-1375,z:11}],rpgCandidate:{x:249,y:-1292,z:14.5},rampApproach:{x:249,y:-1278,z:11.2}};
async function sha256(bytes){const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');}
async function preload(options={}){
 const base=new URL(options.baseURL||'runtime/vice-district/',typeof location!=='undefined'?location.href:'http://localhost/');
 const get=options.fetch||fetch;const response=await get(new URL('manifest.json',base),{signal:options.signal});if(!response.ok)throw new Error('Ocean Drive manifest: '+response.status);
 const manifest=await response.json();let loaded=0;const files=[];
 for(let i=0;i<manifest.files.length;i+=4){
  const batch=await Promise.all(manifest.files.slice(i,i+4).map(async file=>{
   const bytes=new Uint8Array(file.size);let offset=0;
   for(const part of file.chunks){const response=await get(new URL(part.path,base),{signal:options.signal});if(!response.ok)throw new Error('Ocean Drive file: '+response.status);const raw=new Uint8Array(await response.arrayBuffer());if(raw.length!==part.size||await sha256(raw)!==part.sha256)throw new Error('Ocean Drive integrity');bytes.set(raw,offset);offset+=raw.length;loaded+=raw.length;options.onBytes?.(loaded,manifest.size);}
   if(offset!==file.size||await sha256(bytes)!==file.sha256)throw new Error('Ocean Drive assembled integrity');return {fsPath:file.fsPath,bytes};
  }));files.push(...batch);
 }
 return {manifest,files};
}
function install(FS,payload){
 if(!payload?.files?.length)throw new Error('Preload Ocean Drive before native startup');
 for(const file of payload.files){if(!file.fsPath.startsWith(FS_ROOT)||file.fsPath.includes('..'))throw new Error('Invalid district path');FS.mkdirTree(file.fsPath.slice(0,file.fsPath.lastIndexOf('/')));FS.writeFile(file.fsPath,file.bytes);}
 FS.writeFile(FS_ROOT+'data/gta_vc.dat',sceneDat);
 return {location:'Ocean Drive',files:payload.files.length,bytes:payload.manifest.size};
}
function addFinalRamp(FS){
 const path=FS_ROOT+'data/maps/oceandrv/oceandrv.ipl';const text=FS.readFile(path,{encoding:'utf8'});
 if(text.includes('# EGE ORIGINAL RAMP'))return false;
 FS.writeFile(path,text.replace(/^(inst\s*)$/m,'$1\n# EGE ORIGINAL RAMP\n588, ramp, 0, 249, -1280, 9.7, 1, 1, 1, 0, 0, 1, 0'));
 return true;
}
return {preload,install,addFinalRamp,points,sceneDat};
});
