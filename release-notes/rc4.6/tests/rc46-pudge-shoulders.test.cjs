'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const models = path.join(root, 'dist/native-vc/runtime/remote/models/gta3.img');

function chunks(bytes) {
  const result = [];
  for (let offset=0; offset+12<=bytes.length;) {
    const id=bytes.readUInt32LE(offset), size=bytes.readUInt32LE(offset+4);
    if (!id && !size) break;
    assert.ok(offset+12+size<=bytes.length, 'complete RenderWare chunk');
    result.push({id, data:bytes.subarray(offset+12,offset+12+size)});
    offset+=12+size;
  }
  return result;
}
function one(rows,id) { const selected=rows.filter(r=>r.id===id); assert.equal(selected.length,1); return selected[0].data; }
function frameData(bytes) {
  const clump=chunks(one(chunks(bytes),0x10));
  const frames=chunks(one(clump,0x0e));
  const header=one(frames,1), count=header.readUInt32LE(0);
  const rows=[];
  for(let i=0;i<count;i++) rows.push({
    orientation:Array.from({length:9},(_,k)=>header.readFloatLE(4+i*56+k*4)),
    translation:Array.from({length:3},(_,k)=>header.readFloatLE(40+i*56+k*4)),
    parent:header.readInt32LE(52+i*56),
  });
  const ids=new Map();
  for(let i=0;i<frames.length-1;i++) {
    const plugins=chunks(frames[i+1].data);
    for(const p of plugins) if(p.id===0x11e) ids.set(p.data.readInt32LE(4),i);
  }
  return {rows,ids,extensions:frames.slice(1).map(r=>r.data)};
}

test('RC4.6 changes the actual shoulder sockets and preserves all native names, orientations and other local joints',()=>{
  const original=frameData(fs.readFileSync(path.join(models,'male01.dff')));
  const fitted=frameData(fs.readFileSync(path.join(models,'egepudge.dff')));
  assert.deepEqual([...fitted.ids],[...original.ids]);
  assert.deepEqual(fitted.extensions,original.extensions,'same HAnim IDs and frame names');
  const sockets=new Set([fitted.ids.get(22),fitted.ids.get(32)]);
  for(let i=0;i<fitted.rows.length;i++) {
    const a=original.rows[i], b=fitted.rows[i];
    assert.equal(a.parent,b.parent);
    assert.deepEqual(a.orientation,b.orientation,'native animation axes unchanged');
    const displacement=Math.hypot(...a.translation.map((v,k)=>b.translation[k]-v));
    if(sockets.has(i)) assert.ok(displacement>.12 && displacement<.16,'socket moved enough to fit the broad character');
    else assert.ok(displacement<1e-6,'only upper-arm sockets may move');
  }
});

test('RC4.6 keeps the approved Pudge texture and the preloaded asset budget',()=>{
  const texture=fs.readFileSync(path.join(models,'egepudge.txd'));
  assert.equal(crypto.createHash('sha256').update(texture).digest('hex'),'1abbc0128e654041bd6e4686f59a934cb0b006482c9570f1c5926041527cfe8e');
  assert.equal(fs.statSync(path.join(models,'egepudge.dff')).size,313344);
  assert.equal(texture.length,526336);
  assert.deepEqual(fs.readFileSync(path.join(models,'egepudge.dff')),fs.readFileSync(path.join(root,'scripts/pudge-native/output/egepudge.dff')));
});

test('RC4.6 shipped animation channels retain corrected sockets and joined UV seams across idle, walk, run and fight samples',()=>{
  const run=spawnSync('python3',[path.join(root,'scripts/pudge-native/native-pose-validation.py')],{cwd:root,encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const report=JSON.parse(run.stdout);
  assert.equal(report.animationCount,234);
  assert.equal(report.upperArmRotationOnlyTrackCounts['22'],231);
  assert.equal(report.upperArmRotationOnlyTrackCounts['32'],228);
  assert.ok(report.correctedShoulderSocketWidth>report.originalShoulderSocketWidth+.20);
  assert.equal(report.armSegmentLengthsPreserved,true);
  assert.equal(report.samples.length,20);
  assert.ok(report.coincidentVertexPairs>900);
  assert.ok(report.maximumAnimatedSeamGap<.002);
  assert.equal(report.nativeGPUExecuted,false);
});
