'use strict';
const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const ROOT=path.resolve(__dirname,'../../..');
const CL=path.join(ROOT,'native-vc/intro-assets');
const installer=require(path.join(ROOT,'native-vc/intro-classroom-models.js'));
const reader=name=>fs.readFileSync(path.join(CL,name));
function packedFiles(){
  const folder=path.join(ROOT,'native-vc/runtime');
  const manifest=require(path.join(folder,'manifest.json'));
  const bytes=Buffer.concat(manifest.data.chunks.map(item=>fs.readFileSync(path.join(folder,item.path))));
  const glue=fs.readFileSync(path.join(folder,'index.js'),'utf8');
  const rows=Array.from(glue.matchAll(/\{"filename": [^}]+\}/g),m=>JSON.parse(m[0]));
  const map=new Map(rows.map(row=>[row.filename,new Uint8Array(bytes.subarray(row.start,row.end))]));
  return map;
}
const entries=packedFiles();
test('author-built class model has valid RW DFF/TXD, size and SHA256',()=>{
  const provenance=JSON.parse(reader('provenance.json'));
  assert.equal(provenance.nativeEngine,'shipped Vice City WASM');
  assert.equal(provenance.triangleCount,1848);
  for(const f of installer.files){
    const data=new Uint8Array(reader(f.name));
    installer.validFile(f,data);
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'),provenance.sha256[f.name]);
  }
});
test('stock female teacher WFYBU exists in original packed Vice City model package',()=>{
  const ped=entries.get('/vc-assets/local/models/gta3.img/wfybu.dff');
  assert(ped&&ped.length>20000);assert.equal(new DataView(ped.buffer,ped.byteOffset).getUint32(0,true),0x10);
});
test('model ID 5035 is free and appended to actual native generic IDE',()=>{
  const ide=new TextDecoder('latin1').decode(entries.get('/vc-assets/local/data/maps/generic.ide'));
  assert(!/^5035\s*,/m.test(ide));
  const updated=installer.patchIDE(ide);
  assert.match(updated,/^5035, egeclass, egeclass, 1, 160, 0$/m);
  assert.equal(installer.patchIDE(updated),updated);
  assert.throws(()=>installer.patchIDE(ide.replace('objs\n','objs\n5035, someother, othertexture, 1, 140, 0\n')),/occupied/);
});
test('original IMG directory remains intact after appending 3 new model descriptors',()=>{
  const orig=entries.get('/vc-assets/local/models/gta3.dir');
  const out=installer.patchDirectory(orig);
  assert.equal(out.length,orig.length+32*2);
  for(let i=0;i<orig.length;i+=32){ const name=new TextDecoder().decode(orig.subarray(i+8,i+32)).split('\0')[0];
    if(name!=='wfybu.txd')assert.deepEqual(Buffer.from(out.subarray(i,i+32)),Buffer.from(orig.subarray(i,i+32))); }
  assert.deepEqual(Buffer.from(installer.patchDirectory(out)),Buffer.from(out));
  for(const f of installer.files){
    const names=Array.from({length:out.length/32},(_,i)=>new TextDecoder().decode(out.subarray(i*32+8,i*32+32)).split('\0')[0]);
    assert.equal(names.filter(n=>n===f.name).length,1);
  }
});
test('isolated installation writes only intro models, IDE and IMG, never C native SCM',()=>{
  const base=entries,changes=new Map();
  const FS={readFile:(p,options)=>{
    const v=changes.get(p)||base.get(p);if(!v)throw new Error('missing native data '+p);
    return options?.encoding?new TextDecoder(options.encoding).decode(v):v;
  },writeFile:(p,value)=>changes.set(p,typeof value==='string'?new TextEncoder().encode(value):value)};
  const models=Object.fromEntries(installer.files.map(f=>[f.name,new Uint8Array(reader(f.name))]));
  const res=installer.install(FS,models);
  assert.equal(res.roomModelId,5035);assert.equal(res.teacherModelId,67);
  assert.equal(changes.size,5);assert(!changes.has('/vc-assets/local/data/main.scm'));
});
test('native SCM is a valid standalone native script with 3 camera locations and no practice ABI mutations',()=>{
  const scm=reader('intro.scm'), c=JSON.parse(reader('intro-contract.json'));
  assert.equal(scm.length,c.size);
  assert.equal(c.roomDffId,5035);assert.equal(c.teacherPedId,67);assert.equal(c.cameraShots,3);
  assert.equal(crypto.createHash('sha256').update(scm).digest('hex'),c.sha256);
  assert.equal(scm.readUInt16LE(0),0x0002);
  const ops=fs.readFileSync(path.join(ROOT,'release-notes/ege-052/scripts/intro.listing.txt'),'utf8');
  assert.equal((ops.match(/\b015F:/g)||[]).length,3);
  assert.equal((ops.match(/\b0160:/g)||[]).length,3);
  assert.match(ops,/0107: CREATE_OBJECT 5035/);assert.match(ops,/009A: CREATE_CHAR 4 67/);
  assert(!ops.includes('WRITE_MEMORY')&&!ops.includes('CLEO'));
});
test('intro uses native Vice City WASM in an iframe, not an SVG/video image fallback',()=>{
  const app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
  const inner=fs.readFileSync(path.join(ROOT,'native-vc/exam-intro.html'),'utf8');
  const scene=fs.readFileSync(path.join(ROOT,'native-vc/exam-intro-native.js'),'utf8');
  assert.match(app,/native-vc\/exam-intro\.html/);
  assert(!app.includes('assets/cinema/exam-room.svg'));
  assert.match(inner,/<canvas id="canvas"/);
  assert(scene.includes("getContext('webgl2'"));
  assert.match(scene,/window\.GTAExamClassroomModels\.install\(this\.FS,models\)/);
  assert(scene.includes("this.FS.writeFile('/vc-assets/local/data/main.scm',scene)"));
});
test('result 46 is rejected and 60 is admitted in card copy, no fake pass stamp',()=>{
  const w={};const env={window:w,document:{},Intl};vm.runInNewContext(fs.readFileSync(path.join(ROOT,'story-card.js'),'utf8'),env);
  assert.match(w.GTAStory.resultLine({score:46,passScore:60}),/не хватило/i);
  assert.match(w.GTAStory.resultLine({score:60,passScore:60}),/Допущен к GTA VI/);
  const app=fs.readFileSync(path.join(ROOT,'app.js'),'utf8');
  assert.match(app,/title: 'Допущен к GTA VI'/);
  assert.match(app,/Не допущен · пересдача/);
  assert.match(app,/if \(totalScore\(\) >= PASS\) profile\.passes/);
});
