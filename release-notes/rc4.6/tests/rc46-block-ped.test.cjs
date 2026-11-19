'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const api=require('../dist/native-vc/block-ped-model.js');
const output=path.join(root,'scripts/block-ped/output');
const prefix='/vc-assets/local/';
const model=(ext)=>fs.readFileSync(path.join(output,'egesteve.'+ext));
const row=(name,start,sectors)=>{const b=Buffer.alloc(32);b.writeUInt32LE(start);b.writeUInt32LE(sectors,4);b.write(name,8);return b;};
function harness(){
 const files=new Map([
  [prefix+'data/default.ide','peds\n0, null, generic, PLAYER1, STAT_PLAYER, player, 0, null, 9, 9\n1, cop, cop, COP, STAT_COP, man, 0, null, 9, 9\n7, male01, generic, CIVMALE, STAT_SENSIBLE_GUY, man, 0, man, 1, 4\n8, egepudge, egepudge, CIVMALE, STAT_TOUGH_GUY, man, 0, null, 9, 9\n9, HFYST, HFYST, CIVFEMALE, STAT_STREET_GIRL, sexywoman, 013, null, 6, 1\nend\ncars\n130, landstal, landstal, car, LANDSTAL, LANDSTK, null, normal, 10, 7, 0, 251, 0.8\nend\n'],
  [prefix+'models/gta3.dir',Buffer.concat([row('male01.dff',20,42),row('egepudge.dff',100,153),row('egepudge.txd',300,257)])],
  [prefix+'models/gta3.img/egesteve.dff',model('dff')],
  [prefix+'models/gta3.img/egesteve.txd',model('txd')]
 ]);const writes=[];
 return{files,writes,FS:{readFile:p=>{if(!files.has(p))throw Error('Missing file');return files.get(p);},writeFile:(p,b)=>{writes.push(p);files.set(p,b);}}};
}
function chunks(b){const r=[];let o=0;while(o+12<=b.length){const kind=b.readUInt32LE(o),size=b.readUInt32LE(o+4);if(!kind&&!size)break;assert.ok(o+12+size<=b.length,'binary chunk bounds');r.push({kind,body:b.subarray(o+12,o+12+size)});o+=12+size;}return r;}
function child(b,kind){const x=chunks(b).find(x=>x.kind===kind);assert.ok(x,'chunk '+kind);return x.body;}

test('RC4.6 native block pedestrian fits one 32 KiB asset pair, with real skin and flat cubes',()=>{
 const report=JSON.parse(fs.readFileSync(path.join(output,'model-report.json'),'utf8'));
 assert.equal(report.modelID,107);assert.equal(report.slot.slot9Preserved,'HFYST');
 let bytes=0;
 for(const item of report.files){const b=model(path.extname(item.path).slice(1));bytes+=b.length;assert.equal(b.length,item.size);assert.equal(b.length%2048,0);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),item.sha256);}
 assert.equal(bytes,32768);
 const clump=child(model('dff'),0x10),geometry=child(child(clump,0x1a),0xf),data=child(geometry,1);
 assert.equal(data.readUInt32LE(4),72);assert.equal(data.readUInt32LE(8),144);
 const skin=child(child(geometry,3),0x116);assert.equal(skin[0],24);
 const vertices=144,jointOffset=4,weightOffset=4+vertices*4,bones=new Set();
 for(let i=0;i<vertices;i++){
  bones.add(skin[jointOffset+i*4]);assert.ok(skin[jointOffset+i*4]<24);
  assert.equal(skin.readFloatLE(weightOffset+i*16),1);
  for(let k=1;k<4;k++)assert.equal(skin.readFloatLE(weightOffset+i*16+k*4),0);
 }
 assert.equal(bones.size,6,'each of six cubes follows one native bone');
 const txd=child(model('txd'),0x16),tex=child(child(txd,0x15),1);
 assert.equal(tex.readUInt16LE(80),128);assert.equal(tex.readUInt16LE(82),128);assert.equal(tex.readUInt32LE(4)&0xff,1,'nearest pixel filter');
});

test('RC4.6 block installer appends slot 107 without replacing Pudge or original pedestrians',()=>{
 const h=harness(),ide=h.files.get(prefix+'data/default.ide'),dir=h.files.get(prefix+'models/gta3.dir');
 const result=api.install(h.FS);assert.equal(result.modelId,107);
 const next=h.files.get(prefix+'data/default.ide');
 for(const line of ide.split('\n').filter(x=>/^\d+,/.test(x)))assert.ok(next.includes(line));
 assert.match(next,/^107, egesteve, egesteve, CIVMALE, STAT_SENSIBLE_GUY, man, 0, null, 9, 9$/m);
 const nextDir=Buffer.from(h.files.get(prefix+'models/gta3.dir'));
 assert.deepEqual(nextDir.subarray(0,dir.length),dir);assert.equal(nextDir.length,dir.length+64);
 assert.equal(nextDir.readUInt32LE(dir.length),557);assert.equal(nextDir.readUInt32LE(dir.length+4),7);
 assert.equal(nextDir.readUInt32LE(dir.length+32),564);assert.equal(nextDir.readUInt32LE(dir.length+36),9);
});

test('RC4.6 block installer is idempotent when warm-runtime mounting is repeated',()=>{
 const h=harness();api.install(h.FS);const ide=h.files.get(prefix+'data/default.ide'),dir=Buffer.from(h.files.get(prefix+'models/gta3.dir'));
 api.install(h.FS);assert.equal(h.files.get(prefix+'data/default.ide'),ide);assert.deepEqual(Buffer.from(h.files.get(prefix+'models/gta3.dir')),dir);
});

test('RC4.6 block installer rejects occupied slot and broken directory before either mutation',()=>{
 for(const problem of ['occupied','directory','duplicate']){
  const h=harness();let ide=h.files.get(prefix+'data/default.ide');
  if(problem==='occupied')h.files.set(prefix+'data/default.ide',ide.replace('\nend','\n107, somebody, somebody, CIVMALE, STAT_SENSIBLE_GUY, man, 0, null, 9, 9\nend'));
  if(problem==='directory')h.files.set(prefix+'models/gta3.dir',new Uint8Array(7));
  if(problem==='duplicate')h.files.set(prefix+'models/gta3.dir',Buffer.concat([row('egesteve.dff',1,7),row('egesteve.dff',20,7)]));
  assert.throws(()=>api.install(h.FS));assert.deepEqual(h.writes,[]);
 }
});

test('RC4.6 block installer never accepts an incomplete or mislabeled model',()=>{
 for(const ext of ['dff','txd'])for(const problem of ['truncated','wrong-type']){
  const h=harness(),p=prefix+'models/gta3.img/egesteve.'+ext;
  const blob=Buffer.from(h.files.get(p));
  if(problem==='truncated')h.files.set(p,blob.subarray(0,-1));
  else{blob.writeUInt32LE(0);h.files.set(p,blob);}
  assert.throws(()=>api.install(h.FS),/incomplete/);assert.deepEqual(h.writes,[]);
 }
});
