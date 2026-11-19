'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),runtime=path.join(root,'dist/native-vc/runtime');
const api=require('../dist/native-vc/arrival-cast-models.js');
const manifest=JSON.parse(fs.readFileSync(path.join(runtime,'manifest.json'),'utf8'));
const report=JSON.parse(fs.readFileSync(path.join(runtime,'arrival-cast-provenance.json'),'utf8'));
const glue=fs.readFileSync(path.join(runtime,'index.js'),'utf8');
const sourceFiles=new Map([...glue.matchAll(/\{"filename": "([^"]+)", "start": (\d+), "end": (\d+)\}/g)].map(m=>[m[1],[+m[2],+m[3]]]));
const chunkCache=new Map(),prefix='/vc-assets/local/';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function bundled(name){
 const bounds=sourceFiles.get(prefix+name);assert.ok(bounds,'real bundled '+name);
 const [start,end]=bounds,out=Buffer.alloc(end-start);
 for(const part of manifest.data.chunks){
  const lo=Math.max(start,part.offset),hi=Math.min(end,part.offset+part.size);if(lo>=hi)continue;
  if(!chunkCache.has(part.path)){const b=fs.readFileSync(path.join(runtime,part.path));assert.equal(hash(b),part.sha256);chunkCache.set(part.path,b);}
  chunkCache.get(part.path).copy(out,lo-start,lo-part.offset,hi-part.offset);
 }
 return out;
}
function records(b){const result=new Map();for(let o=0;o<b.length;o+=32){const name=b.subarray(o+8,o+32).toString('ascii').replace(/\0.*$/,'').toLowerCase();result.set(name,{start:b.readUInt32LE(o),sectors:b.readUInt32LE(o+4),bytes:b.subarray(o,o+32)});}return result;}
function harness(){
 const files=new Map([
  [prefix+'data/default.ide',bundled('data/default.ide').toString('utf8')],
  [prefix+'models/gta3.dir',bundled('models/gta3.dir')],
  [prefix+'models/gta3.img/stripa.dff',bundled('models/gta3.img/stripa.dff')],
  [prefix+'models/gta3.img/stripa.txd',bundled('models/gta3.img/stripa.txd')],
  ...['dff','txd'].map(ext=>[prefix+'models/gta3.img/egecj.'+ext,fs.readFileSync(path.join(runtime,'remote/models/gta3.img/egecj.'+ext))])
 ]),writes=[];
 return {files,writes,FS:{readFile:p=>{if(!files.has(p))throw Error('Missing '+p);return files.get(p);},writeFile:(p,b)=>{writes.push(p);files.set(p,b);}}};
}
function children(b){const out=[];for(let o=0;o+12<=b.length;){const kind=b.readUInt32LE(o),n=b.readUInt32LE(o+4);if(!kind&&!n)break;assert.ok(o+12+n<=b.length);out.push({kind,body:b.subarray(o+12,o+12+n)});o+=12+n;}return out;}
function child(b,k){const found=children(b).find(x=>x.kind===k);assert.ok(found,'RW chunk '+k);return found.body;}
function mesh(b){const clump=child(b,0x10),geometry=child(child(clump,0x1a),0xf),st=child(geometry,1),nv=st.readUInt32LE(8),nt=st.readUInt32LE(4),flags=st.readUInt32LE(0);let offset=28+((flags&8)?4*nv:0);const sets=(flags>>>16)&255||((flags&128)?2:(flags&4)?1:0);offset+=8*nv*sets;const triangles=st.subarray(offset,offset+8*nt);offset+=8*nt+24;const positions=st.subarray(offset,offset+12*nv);const skin=child(child(geometry,3),0x116);return{nv,nt,positions,triangles,skin};}

test('RC4.7 keeps native human mesh and skin, adds only 90 KiB and uses the existing original club dancer',()=>{
 assert.deepEqual(api.models,[108,109]);assert.equal(report.additionalDownloadBytes,92160);
 const original=fs.readFileSync(path.join(runtime,report.sourceMesh));assert.equal(hash(original),report.sourceSHA256);
 const extra=fs.readFileSync(path.join(runtime,'remote/models/gta3.img/egecj.dff'));
 const a=mesh(original),b=mesh(extra);assert.equal(b.nv,941);assert.equal(b.nt,970);
 assert.deepEqual(b.positions,a.positions,'unchanged original human shape');
 assert.deepEqual(b.triangles,a.triangles,'unchanged original triangles');
 const skinOffset=4+a.nv*20;
 assert.deepEqual(b.skin.subarray(0,skinOffset),a.skin.subarray(0,skinOffset),'unchanged native vertex weights and bone indices');
 for(let bone=0;bone<24;bone++)for(const entry of [0,1,2,4,5,6,8,9,10,12,13,14]){
  const offset=skinOffset+bone*68+4+entry*4;
  assert.equal(b.skin.readFloatLE(offset),a.skin.readFloatLE(offset),'unchanged inverse transform '+bone+'/'+entry);
 }
 for(const f of report.files){const bytes=fs.readFileSync(path.join(runtime,f.path)),entry=manifest.models.files.find(x=>x.path===f.path);assert.equal(hash(bytes),f.sha256);assert.equal(bytes.length,f.size);assert.equal(bytes.length%2048,0);assert.equal(entry.sha256,f.sha256);}
 for(const f of report.dancer.files){const bytes=bundled(f.path.slice(prefix.length));assert.equal(hash(bytes),f.sha256);assert.equal(bytes.length,f.size);}
 assert.equal(report.nativeGPUExecuted,false);
});

test('RC4.7 installer succeeds with the actual bundled IDE and directory without changing any original actor or dancer byte',()=>{
 const h=harness(),beforeIDE=h.files.get(prefix+'data/default.ide'),beforeDir=Buffer.from(h.files.get(prefix+'models/gta3.dir'));
 const originals=new Map([...h.files].filter(([p])=>p.includes('/gta3.img/')).map(([p,b])=>[p,Buffer.from(b)]));
 const result=api.install(h.FS);assert.deepEqual(result.models,[108,109]);
 const after=h.files.get(prefix+'data/default.ide');
 for(const line of beforeIDE.split(/\r?\n/).filter(x=>/^\s*\d+,/.test(x)&&!/^\s*109,/.test(x)))assert.ok(after.includes(line),'unchanged native definition '+line);
 assert.match(after,/^108, egecj, egecj,/m);assert.match(after,/^109, stripa, stripa, CIVFEMALE,/m);
 const afterDir=Buffer.from(h.files.get(prefix+'models/gta3.dir'));assert.deepEqual(afterDir.subarray(0,beforeDir.length),beforeDir);
 const r=records(afterDir);assert.equal(r.get('egecj.dff').sectors,36);assert.equal(r.get('egecj.txd').sectors,9);
 assert.ok(r.get('stripa.dff').sectors>=42);assert.ok(r.get('stripa.txd').sectors>=11);
 for(const [p,b] of originals)assert.deepEqual(h.files.get(p),b,'model file untouched '+p);
 assert.deepEqual(h.writes,[prefix+'data/default.ide',prefix+'models/gta3.dir']);
 api.install(h.FS);assert.equal(h.files.get(prefix+'data/default.ide'),after);assert.deepEqual(Buffer.from(h.files.get(prefix+'models/gta3.dir')),afterDir);
});

test('RC4.7 occupied native slots, incomplete dancers and corrupt directories reject before writing',()=>{
 for(const problem of ['108','109','dancer','directory']){
  const h=harness(),ide=h.files.get(prefix+'data/default.ide');
  if(problem==='108')h.files.set(prefix+'data/default.ide',ide.replace('peds\n','peds\n108, someone, someone, CIVMALE, STAT_SENSIBLE_GUY, man, 0, null, 9, 9\n'));
  if(problem==='109')h.files.set(prefix+'data/default.ide',ide.replace(/109,\s*special01,\s*generic,/,'109, someone, someone,'));
  if(problem==='dancer')h.files.set(prefix+'models/gta3.img/stripa.dff',Buffer.alloc(20));
  if(problem==='directory')h.files.set(prefix+'models/gta3.dir',Buffer.alloc(7));
  assert.throws(()=>api.install(h.FS),problem);assert.deepEqual(h.writes,[]);
 }
});
