'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

test('RC4.6 added traffic and walkers have shipped floor and clear static body corridors',()=>{
  const report=JSON.parse(execFileSync('python3',[path.resolve(__dirname,'../scripts/native-scm/check-rc46-street.py')],{encoding:'utf8'}));
  assert.equal(report.nativeRuntimeExecuted,false);
  assert.equal(report.valid,true);
  assert.equal(report.traffic.length,2);assert.equal(report.walkers.length,3);
  assert(report.traffic.reduce((n,a)=>n+a.clearance.checkedCarVolumes,0)>400);
  assert(report.traffic.every(t=>t.northbound),'Cars approach the southbound route');
  for(const actor of [...report.traffic,...report.walkers]){
    assert.deepEqual(actor.clearance.missingFloor,[]);
    assert.deepEqual(actor.clearance.overlaps,[]);
  }
  assert(report.walkers[1].clearance.checkedPedVolumes>30);
  assert.equal(report.walkers.some(w=>w.model===107),false,'Steve belongs to the helicopter cast now');
});
