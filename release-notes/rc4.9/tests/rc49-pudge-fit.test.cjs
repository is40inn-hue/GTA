'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');
function python(script) {
 const run=spawnSync('python3',[path.join(root,'scripts/pudge-native',script)],{cwd:root,encoding:'utf8'});
 assert.equal(run.status,0,run.stderr||run.stdout);return JSON.parse(run.stdout);
}
test('RC4.9 clavicle skin is rigid and meets its outer shoulder socket without scaling the collar toward the neck',()=>{
 const report=python('validate-pudge-native.py');
 assert.equal(report.clavicleSkinUnitScale,true);
 assert.deepEqual(Object.keys(report.clavicleOuterAnchorMaxErrors),['21','31']);
 for(const error of Object.values(report.clavicleOuterAnchorMaxErrors)) assert.ok(error<1e-8);
 assert.ok(report.inverseBindMaxError<1e-5);
 assert.ok(report.reconstructedBindVertexMaxError<1e-5);
});
test('RC4.9 native sports-bike mount, ride and steering samples preserve shoulder sockets and joined UV seams',()=>{
 const report=python('rc49-shoulder-validation.py');
 assert.equal(report.sportsBikeAnimationCount,18);
 assert.equal(report.samples.length,30);
 assert.equal(report.shoulderTranslationsPreserved,true);
 assert.equal(report.nativeGPUExecuted,false);
 assert.ok(report.coincidentVertexPairs>900);
 assert.ok(report.maximumAnimatedSeamGap<.002);
 assert.deepEqual([...new Set(report.samples.map(s=>s.clip))],['BIKEs_jumponL','BIKEs_jumponR','BIKEs_Ride','BIKEs_Still','BIKEs_Left','BIKEs_Right']);
 for(const row of report.clavicleSkin) {assert.ok(Math.abs(row.skinLengthScale-1)<1e-9);assert.ok(row.outerAnchorError<1e-8);}
});
test('RC4.9 ships the regenerated model with the same 24-bone format and unchanged texture footprint',()=>{
 const p=JSON.parse(fs.readFileSync(path.join(root,'dist/native-vc/runtime/pudge-model-provenance.json')));
 assert.equal(p.nativeBoneCount,24);assert.equal(p.characterMeshesRetained,9);
 assert.equal(p.shoulderFit.clavicleSkinScale,1);assert.equal(p.nativeGPUExecuted,false);
 assert.equal(p.files.find(f=>f.path.endsWith('.dff')).size,313344);
 assert.equal(p.files.find(f=>f.path.endsWith('.txd')).sha256,'1abbc0128e654041bd6e4686f59a934cb0b006482c9570f1c5926041527cfe8e');
});
