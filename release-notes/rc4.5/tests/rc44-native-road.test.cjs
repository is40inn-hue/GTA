'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('RC4.4 route has shipped floors and car-body clearance with the native IPL rotation', () => {
  const root=path.resolve(__dirname,'..');
  const report=JSON.parse(execFileSync('python3',[path.join(root,'scripts/native-scm/check-rc44-road.py')],{encoding:'utf8'}));
  assert.equal(report.runtimeExecuted,false,'Static geometry check is not a gameplay claim');
  assert.equal(report.missing.length,0);assert.equal(report.coveredPoints,report.checkedPoints);
  assert(report.checkedPoints>250);assert(report.routeMetres>400);assert(report.routeOneDirection);
  assert(report.minFloorZ>9&&report.maxFloorZ<10.5);
  assert(report.floorModels.includes('oceanrda06_dy'));
  assert(report.floorModels.includes('od_oceanrdn1_dy'),'Southern extension is backed by real collision geometry');
  assert(report.clearance.checkedCarVolumes>800);
  assert.deepEqual(report.clearance.heightAboveRoadMetres,[0.2,2.4]);
  assert.equal(report.clearance.sampleStepMetres,0.5);
  assert.deepEqual(report.clearance.overlaps,[]);
  assert.deepEqual(report.clearance.missingFloor,[]);
  assert(report.colonyStep.bounds[0][1]<190,'Native inverse IPL rotation keeps the Colony step on the western sidewalk');
  assert(report.colonyStep.heightAboveStreetMetres>1.1,'Building step is included, not silently discarded as a floor');
});

test('the static clearance checker distinguishes a body-level wall from floor and a high canopy', () => {
  const root=path.resolve(__dirname,'..');
  execFileSync('python3',['-c',`
import runpy
m=runpy.run_path(${JSON.stringify(path.join(root,'scripts/native-scm/check-rc44-road.py'))})
overlap=m['triangle_box_overlap']; half=(1.2,2.5,1.1)
assert overlap(((0,-5,-5),(0,5,-5),(0,0,5)),half), 'A thin wall through the body must block'
assert not overlap(((-5,-5,-1.3),(5,-5,-1.3),(0,5,-1.3)),half), 'Road floor stays below the body'
assert not overlap(((-5,-5,3),(5,-5,3),(0,5,3)),half), 'High canopy has clearance'
assert not overlap(((2,-5,-5),(2,5,-5),(2,0,5)),half), 'A wall beside the car must not block'
`],{encoding:'utf8'});
});
