'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),runtime=path.join(root,'dist/native-vc/runtime');
const api=require('../dist/native-vc/scene-vehicles.js');
const manifest=JSON.parse(fs.readFileSync(path.join(runtime,'manifest.json')));
const report=JSON.parse(fs.readFileSync(path.join(runtime,'scene-vehicles-provenance.json')));
const config=JSON.parse(fs.readFileSync(path.join(root,'dist/native-vc/range-config.json')));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=new Map([...fs.readFileSync(path.join(runtime,'index.js'),'utf8').matchAll(/\{"filename": "([^"]+)", "start": (\d+), "end": (\d+)\}/g)].map(m=>[m[1],[+m[2],+m[3]]]));
const prefix='/vc-assets/local/',cache=new Map();
function bundled(name){const [start,end]=files.get(prefix+name)||[];assert(Number.isFinite(start),'bundled '+name);const out=Buffer.alloc(end-start);
 for(const c of manifest.data.chunks){const lo=Math.max(start,c.offset),hi=Math.min(end,c.offset+c.size);if(lo>=hi)continue;if(!cache.has(c.path)){const b=fs.readFileSync(path.join(runtime,c.path));assert.equal(hash(b),c.sha256);cache.set(c.path,b);}cache.get(c.path).copy(out,lo-start,lo-c.offset,hi-c.offset);}return out;}
function chunks(b){const out=[];for(let o=0;o+12<=b.length;){const type=b.readUInt32LE(o),n=b.readUInt32LE(o+4);if(!type&&!n)break;assert(o+12+n<=b.length,'whole RW chunk');out.push({type,body:b.subarray(o+12,o+12+n)});o+=12+n;}return out;}
function child(b,t){const c=chunks(b).find(x=>x.type===t);assert(c,'RW chunk '+t);return c.body;}
function dff(name){const raw=fs.readFileSync(path.join(runtime,'remote/models/gta3.img/'+name+'.dff'));
 const c=child(raw,0x10),fp=chunks(child(c,0xe)),st=fp[0].body,n=st.readUInt32LE(0);
 const frames=fp.slice(1).map((v,i)=>({name:child(v.body,0x253f2fe).toString('ascii').replace(/\0.*$/,''),parent:st.readInt32LE(4+i*56+48),position:[0,1,2].map(j=>st.readFloatLE(4+i*56+36+j*4)),bytes:st.subarray(4+i*56,4+(i+1)*56)}));
 assert.equal(frames.length,n);const geoms=chunks(child(c,0x1a)).filter(v=>v.type===0xf).map(v=>v.body);
 const atoms=chunks(c).filter(v=>v.type===0x14).map(v=>{const a=child(v.body,1);return{frame:a.readUInt32LE(0),geometry:a.readUInt32LE(4)};});
 for(const a of atoms){assert(a.frame<frames.length);assert(a.geometry<geoms.length);}
 for(const [i,f] of frames.entries()){assert(f.parent<i&&f.parent>=-1);assert(f.position.every(Number.isFinite));}
 for(const g of geoms){const s=child(g,1),flags=s.readUInt32LE(0),nt=s.readUInt32LE(4),nv=s.readUInt32LE(8);assert(nt&&nv);
  let o=28+((flags&8)?nv*4:0);const uv=(flags>>>16)&255||((flags&128)?2:(flags&4)?1:0);o+=uv*nv*8;
  for(let t=0;t<nt;t++)for(const off of [0,2,6])assert(s.readUInt16LE(o+t*8+off)<nv,'valid triangle vertex');
  o+=nt*8;const sphere=[0,1,2,3].map(i=>s.readFloatLE(o+i*4));o+=24;assert(sphere.every(Number.isFinite)&&sphere[3]>0);
  for(let v=0;v<nv;v++){const p=[0,1,2].map(j=>s.readFloatLE(o+v*12+j*4));assert(p.every(Number.isFinite));assert(Math.hypot(...p.map((x,i)=>x-sphere[i]))<=sphere[3]+1e-3,'geometry bound contains vertex');}
 }
 return{raw,frames,geoms,atoms};}
function harness(){const map=new Map([[prefix+'data/default.ide',bundled('data/default.ide').toString('utf8')],[prefix+'models/gta3.dir',bundled('models/gta3.dir')],[prefix+'models/coll/vehicles.col',bundled('models/coll/vehicles.col')],...api.files.map(f=>[prefix+'models/gta3.img/'+f.name,fs.readFileSync(path.join(runtime,'remote/models/gta3.img/'+f.name))])]);const writes=[];return{map,writes,FS:{readFile:p=>map.get(p),writeFile:(p,b)=>{map.set(p,b);writes.push(p);}}};}

test('native bike and patrol assets are complete, small, preloaded, have valid geometry and distinct equipped silhouette',()=>{
 assert.equal(report.additionalBytes,282624);assert.equal(report.runtimeExecuted,false);assert.equal(report.newExternalGameAssets,false);
 for(const f of report.files){const b=fs.readFileSync(path.join(runtime,f.path)),m=manifest.models.files.find(x=>x.path===f.path);assert(m);assert.equal(hash(b),f.sha256);assert.equal(f.sha256,m.sha256);assert.equal(b.length,m.size);assert.equal(b.length%2048,0);}
 const bike=dff('pcj600'),base=dff('maverick'),patrol=dff('polmav');
 const names=bike.frames.map(f=>f.name);assert.equal(new Set(names).size,names.length);
 for(const name of ['chassis_dummy','forks_front','forks_rear','wheel_front','wheel_rear','mudguard','handlebars','ped_frontseat','ped_backseat'])assert(names.includes(name));
 const index=name=>names.indexOf(name),f=name=>bike.frames[index(name)];
 assert.equal(f('wheel_front').parent,index('forks_front'));assert.equal(f('wheel_rear').parent,index('forks_rear'));assert.equal(f('mudguard').parent,index('forks_front'));
 assert(Math.hypot(...f('wheel_rear').position)>0.5,'rear suspension has a nonzero native fork length');
 assert(Math.abs(f('forks_front').position[2])>.1,'front wheel pivot has a usable native slope');
 assert.equal(patrol.frames.length,base.frames.length+1);assert.equal(patrol.geoms.length,base.geoms.length+1);
 base.frames.forEach((f,i)=>assert.deepEqual(f.bytes,patrol.frames[i].bytes,'original rotor/door/seat transform preserved'));
 base.geoms.forEach((g,i)=>assert.deepEqual(g,patrol.geoms[i],'existing native structure preserved'));
 assert.equal(patrol.frames.at(-1).name,'patrol_equipment');assert(report.models[1].addedTriangles>=300);
 assert.notEqual(config.scenes[0].targetModels[0],config.scenes[2].targetModels[2]);assert.equal(config.scenes[2].targetModels[2],227);
});

test('vehicle installer validates real native definitions and collision, patches only directory and is idempotent',()=>{
 const h=harness(),ide=h.map.get(prefix+'data/default.ide'),col=Buffer.from(h.map.get(prefix+'models/coll/vehicles.col'));
 const result=api.install(h.FS);assert.deepEqual(result.models,[191,227]);assert.deepEqual(h.writes,[prefix+'models/gta3.dir']);
 assert.equal(h.map.get(prefix+'data/default.ide'),ide);assert.deepEqual(h.map.get(prefix+'models/coll/vehicles.col'),col);
 const patched=Buffer.from(h.map.get(prefix+'models/gta3.dir'));api.install(h.FS);assert.deepEqual(Buffer.from(h.map.get(prefix+'models/gta3.dir')),patched);
 const rows=new Map();for(let o=0;o<patched.length;o+=32)rows.set(patched.subarray(o+8,o+32).toString('ascii').replace(/\0.*$/,''),patched.readUInt32LE(o+4));
 for(const f of api.files)assert.equal(rows.get(f.name),f.bytes/2048);
 for(const problem of ['missing-model','wrong-slot','missing-collision','bad-directory']){
  const bad=harness();
  if(problem==='missing-model')bad.map.set(prefix+'models/gta3.img/pcj600.dff',Buffer.alloc(40));
  if(problem==='wrong-slot')bad.map.set(prefix+'data/default.ide',ide.replace(/191,\s*pcj600/,'191, wrong'));
  if(problem==='missing-collision')bad.map.set(prefix+'models/coll/vehicles.col',Buffer.alloc(40));
  if(problem==='bad-directory')bad.map.set(prefix+'models/gta3.dir',Buffer.alloc(7));
  assert.throws(()=>api.install(bad.FS),problem);assert.deepEqual(bad.writes,[],'reject invalid package before mutating FS');
 }
});

test('SCM escape success/failure, warmup, immutable replay and map semantics execute against explicit query fixtures',()=>{
 const r=JSON.parse(execFileSync('python3',[path.join(root,'scripts/native-scm/trace-rc49-native.py')],{encoding:'utf8'}));
 assert.equal(r.nativeRuntimeExecuted,false);assert.equal(r.passed,9);assert.equal(r.scmSHA256,config.sha256);
 const old=JSON.parse(fs.readFileSync(path.join(root,'dist/release-notes/rc4.8/scripts/native-scm/native-exam-main.contract.json')));
 for(const [key,value] of Object.entries(old.slots))assert.equal(config.slots[key],value,'unchanged existing ABI '+key);
 assert.equal(config.slots.escapeBike,204);assert.equal(config.slots.playerHeading,217);assert.equal(config.slots.mapValid,222);
 assert.equal(config.escape.nativeBoardingRequired,true);assert.equal(config.escape.nativeDriverRequired,true);assert.equal(config.escape.warpAllowed,false);
 assert.equal(config.escape.scored,false);assert(config.escape.boardingMilliseconds<=6500);assert.equal(config.escape.maximumBoardingAttempts,2);
});

test('bike parking approach and escape connector have shipped floors and static vehicle clearance',()=>{
 const r=JSON.parse(execFileSync('python3',[path.join(root,'scripts/native-scm/check-rc49-escape.py')],{encoding:'utf8'}));
 assert.equal(r.nativeRuntimeExecuted,false);assert.equal(r.valid,true);
 assert(r.vehicleCorridor.checkedCarVolumes>200);assert(r.humanApproach.checkedPedVolumes>10);
 for(const corridor of [r.vehicleCorridor,r.humanApproach]){assert.deepEqual(corridor.missingFloor,[]);assert.deepEqual(corridor.overlaps,[]);}
});
