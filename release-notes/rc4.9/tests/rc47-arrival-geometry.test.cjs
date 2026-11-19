'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),{execFileSync}=require('node:child_process');
test('RC4.7 initial weapon corridor and four helicopter foreground approaches have shipped floors and static body clearance',()=>{
 const r=JSON.parse(execFileSync('python3',[path.resolve(__dirname,'../scripts/native-scm/check-rc47-arrival.py')],{encoding:'utf8'}));
 assert.equal(r.nativeRuntimeExecuted,false);assert.equal(r.valid,true);assert.equal(r.foregroundApproaches.length,4);
 assert.equal(r.initialPickup.forwardMetres,3);assert.ok(r.initialPickup.distanceFromHelicopterCentre>14);
 for(const c of [r.initialPickup.clearance,...r.foregroundApproaches.map(a=>a.clearance)]){assert.deepEqual(c.missingFloor,[]);assert.deepEqual(c.overlaps,[]);assert.ok(c.checkedPedVolumes>3);}
});
