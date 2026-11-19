'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const api=require('../dist/native-vc/pudge-model.js');
const runtime=path.join(__dirname,'../dist/native-vc/runtime');
const prefix='/vc-assets/local/';
function hash(b){return crypto.createHash('sha256').update(b).digest('hex');}
function directory(rows){const b=new Uint8Array(rows.length*32),v=new DataView(b.buffer);rows.forEach(([name,off,size],i)=>{v.setUint32(i*32,off,true);v.setUint32(i*32+4,size,true);b.set(Buffer.from(name),i*32+8);});return b;}
function records(b){const v=new DataView(b.buffer,b.byteOffset,b.byteLength);return Array.from({length:b.length/32},(_,i)=>({name:Buffer.from(b.slice(i*32+8,i*32+32)).toString().split('\0')[0],offset:v.getUint32(i*32,true),size:v.getUint32(i*32+4,true)}));}
function harness(){
 const files=new Map([
  [prefix+'data/default.ide','peds\n0, null, generic, PLAYER1, STAT_PLAYER, player, 0, null, 9, 9\n1, cop, cop, COP, STAT_COP, man, 0, null, 9, 9\n7, male01, male01, CIVMALE, STAT_SENSIBLE_GUY, man, 0, man, 1, 4\nend\ncars\n130, landstal, landstal, car, LANDSTAL, LANDSTK, null, normal, 10, 7, 0, 251, 0.8\nend\n'],
  [prefix+'models/gta3.dir',directory([['male01.dff',100,35],['cop.dff',135,35],['generic.txd',170,20]])],
  ...['egepudge.dff','egepudge.txd'].map(name=>[prefix+'models/gta3.img/'+name,new Uint8Array(fs.readFileSync(path.join(runtime,'remote/models/gta3.img',name)))])
 ]);const writes=[];
 return {files,writes,FS:{readFile:p=>{if(!files.has(p))throw Error('Missing: '+p);return files.get(p);},writeFile:(p,b)=>{writes.push(p);files.set(p,b);}}};
}
test('dedicated native Pudge install preserves player, police, humans, cars and original IMG records',()=>{
 const h=harness(),oldIDE=h.files.get(prefix+'data/default.ide'),oldDir=h.files.get(prefix+'models/gta3.dir').slice();
 assert.deepEqual(api.install(h.FS),{modelId:8,model:'egepudge',files:['egepudge.dff','egepudge.txd']});
 const ide=h.files.get(prefix+'data/default.ide');
 for(const row of oldIDE.split('\n').filter(x=>/^\d/.test(x)))assert.ok(ide.includes(row));
 assert.match(ide,/^8, egepudge, egepudge, CIVMALE, STAT_TOUGH_GUY, man, 0, null, 9, 9$/m);
 const updated=h.files.get(prefix+'models/gta3.dir');assert.deepEqual(updated.slice(0,oldDir.length),oldDir);
 const added=records(updated).slice(3);assert.deepEqual(added.map(r=>[r.name,r.size]),[['egepudge.dff',153],['egepudge.txd',257]]);
 assert.ok(added[0].offset>=190);assert.ok(added[1].offset>=added[0].offset+added[0].size);
 assert.equal(h.writes.length,2);
});
test('reinstalling the same cameo is idempotent and cannot exhaust native directory entries',()=>{
 const h=harness();api.install(h.FS);const ide=h.files.get(prefix+'data/default.ide'),dir=h.files.get(prefix+'models/gta3.dir').slice();
 api.install(h.FS);assert.equal(h.files.get(prefix+'data/default.ide'),ide);assert.deepEqual(h.files.get(prefix+'models/gta3.dir'),dir);
});
test('directory repair handles Buffer and offset Uint8Array without mutating the supplied bytes',()=>{
 const original=directory([['male01.dff',100,35],['egepudge.dff',135,1],['egepudge.txd',136,1]]);
 for(const asBuffer of [true,false]){
  const outer=Buffer.alloc(original.length+41,0xab);outer.set(original,17);
  const input=asBuffer?outer.subarray(17,17+original.length):new Uint8Array(outer.buffer,outer.byteOffset+17,original.length);
  const before=Buffer.from(outer);const patched=api.patchDirectory(input);assert.deepEqual(outer,before);
  const rows=records(patched);assert.equal(rows[0].offset,100);assert.equal(rows[0].size,35);
  assert.equal(rows[1].size,153);assert.equal(rows[2].size,257);assert.ok(rows[2].offset>=rows[1].offset+rows[1].size);
 }
});
test('occupied ped slot or duplicate model directory fails without mutating either definition',()=>{
 for(const type of ['slot','directory']){
  const h=harness();if(type==='slot')h.files.set(prefix+'data/default.ide','peds\n8, anotherped, anotherped, CIVMALE, STAT_SENSIBLE_GUY, man, 0, null, 9,9\nend\n');
  else h.files.set(prefix+'models/gta3.dir',directory([['egepudge.dff',1,153],['EGEPUDGE.DFF',154,153]]));
  assert.throws(()=>api.install(h.FS),/occupied|Duplicate/);assert.equal(h.writes.length,0);
 }
});
test('missing, truncated or wrong RenderWare asset cannot enter an apparently ready native scene',()=>{
 for(const type of ['missing','short','wrongType']){
  const h=harness(),name=prefix+'models/gta3.img/egepudge.dff';
  if(type==='missing')h.files.delete(name);
  if(type==='short')h.files.set(name,h.files.get(name).slice(0,-1));
  if(type==='wrongType')h.files.get(name)[0]=0x16;
  assert.throws(()=>api.install(h.FS),/Missing|incomplete/);assert.equal(h.writes.length,0);
 }
});
function chunks(b){let p=0,out=[];while(p+12<=b.length){const id=b.readUInt32LE(p),n=b.readUInt32LE(p+4);if(!id&&!n)break;assert.ok(p+12+n<=b.length);out.push({id,b:b.subarray(p+12,p+12+n)});p+=12+n;}return out;}
function one(c,id){const matches=c.filter(x=>x.id===id);assert.equal(matches.length,1);return matches[0].b;}
test('shipped DFF has finite geometry, complete HAnim skin and correctly sided shoulder weights',()=>{
 const raw=fs.readFileSync(path.join(runtime,'remote/models/gta3.img/egepudge.dff'));const c=chunks(one(chunks(raw),0x10));
 const fl=chunks(one(c,14));assert.equal(fl[0].b.readUInt32LE(0),25);
 const idByIndex=[];for(const ext of fl.slice(1)){for(const p of chunks(ext.b)){if(p.id!==0x11e||p.b.readUInt32LE(8)===0)continue;assert.equal(p.b.readUInt32LE(8),24);for(let i=0;i<24;i++)idByIndex[p.b.readUInt32LE(24+i*12)]=p.b.readUInt32LE(20+i*12);}}
 assert.equal(new Set(idByIndex).size,24);for(const id of [21,22,23,24,31,32,33,34])assert.ok(idByIndex.includes(id));
 const geom=chunks(one(chunks(one(c,0x1a)),15)),g=one(geom,1);const triangles=g.readUInt32LE(4),vertices=g.readUInt32LE(8);
 assert.equal(vertices,3895);assert.equal(triangles,5266);const ext=chunks(one(geom,3)),skin=one(ext,0x116);assert.equal(skin[0],24);assert.equal(skin[1],0);
 const j=skin.subarray(4,4+vertices*4);let used=new Set();
 for(let v=0;v<vertices;v++){let sum=0;for(let k=0;k<4;k++){const weight=skin.readFloatLE(4+vertices*4+v*16+k*4);assert.ok(Number.isFinite(weight)&&weight>=0&&weight<=1.00001);assert.ok(j[v*4+k]<24);if(weight>.001)used.add(idByIndex[j[v*4+k]]);sum+=weight;}assert.ok(Math.abs(sum-1)<1e-5);}
 for(const id of [21,22,23,24,31,32,33,34])assert.ok(used.has(id));
 let offset=28+vertices*8;for(let i=0;i<triangles;i++){for(const k of [0,1,3])assert.ok(g.readUInt16LE(offset+i*8+k*2)<vertices);}offset+=triangles*8+24;
 let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let v=0;v<vertices;v++)for(let k=0;k<3;k++){const x=g.readFloatLE(offset+(v*3+k)*4);assert.ok(Number.isFinite(x));lo[k]=Math.min(lo[k],x);hi[k]=Math.max(hi[k],x);}
 assert.ok(lo[1]>-1.1&&lo[1]<-.9,'feet remain at VC ped ground height');assert.ok(hi[1]-lo[1]<2.6,'no exploding shoulder/weapon geometry');
 assert.ok(hi[0]-lo[0]<2.3,'native T-pose stays bounded including the cosmetic hand weapons');
});
test('both real Pudge assets belong to verified background preload with leaves at most 512 KiB',()=>{
 const m=JSON.parse(fs.readFileSync(path.join(runtime,'manifest.json')));const files=m.models.files.filter(f=>/\/egepudge\.(dff|txd)$/.test(f.path));assert.equal(files.length,2);
 for(const f of files){const parts=f.chunks||[f],buffer=Buffer.concat(parts.map(p=>{const bytes=fs.readFileSync(path.join(runtime,p.path));assert.equal(bytes.length,p.size);assert.equal(hash(bytes),p.sha256);assert.ok(bytes.length<=512*1024);return bytes;}));assert.equal(buffer.length,f.size);assert.equal(hash(buffer),f.sha256);assert.equal(f.originalPath,'/'+f.path);}
 assert.ok(files.reduce((n,f)=>n+f.size,0)<1024*1024);
});
