const test = require('node:test');
const assert = require('node:assert/strict');
const radar = require('../dist/native-vc/hud-radar.js');

test('native VC map bounds place north-west and south-east in the correct atlas corners', () => {
  assert.deepEqual(radar.worldToAtlas(-2000, 2000), {x: 0, y: 0});
  assert.deepEqual(radar.worldToAtlas(2000, -2000), {x: 1024, y: 1024});
  assert.deepEqual(radar.worldToAtlas(0, 0), {x: 512, y: 512});
  assert.ok(radar.worldToAtlas(288.8, -1083).y > 512);
});

test('off-map objective remains at the rim with real distance and direction', () => {
  const p = radar.projectTarget({x: 0, y: 0}, {x: 300, y: 400}, 100, 50);
  assert.equal(p.distance, 500); assert.equal(p.clipped, true);
  assert.ok(Math.abs(Math.hypot(p.x, p.y) - 41) < 1e-10);
  assert.ok(p.x > 0 && p.y < 0);
  const near = radar.projectTarget({x: 0, y: 0}, {x: 10, y: 0}, 100, 50);
  assert.equal(near.clipped, false); assert.equal(near.x, 5);
});

function fixture() {
  const contract = {magic: [123, 456], version: 3, slots: {playerX: 3, playerY: 4, playerHeading: 5,
    mapTargetX: 6, mapTargetY: 7, mapTargetKind: 8, mapValid: 9, inCar: 10}};
  const heap = new Int32Array(20), floats = new Float32Array(heap.buffer);
  heap.set([123,456,3]); floats[3] = 288.8; floats[4] = -1083; floats[5] = 180;
  floats[6] = 290; floats[7] = -1150; heap[8] = 3; heap[9] = 1; heap[10] = 1;
  return {contract, heap, floats};
}
test('radar reads native floats without interpreting integer bit patterns as positions', () => {
  const f = fixture(), p = radar.readPacket(f.heap, 0, f.contract);
  assert.ok(Math.abs(p.player.x - 288.8) < 0.001);
  assert.equal(p.player.y, -1083); assert.equal(p.player.heading, 180);
  assert.equal(p.target.y, -1150); assert.equal(p.driving, true);
});
test('no fabricated player or objective before a valid native telemetry packet', () => {
  const f = fixture(); f.heap[9] = 0;
  assert.equal(radar.readPacket(f.heap, 0, f.contract), null);
  f.heap[9] = 1; f.heap[0] = 999;
  assert.equal(radar.readPacket(f.heap, 0, f.contract), null);
  f.heap[0] = 123; f.floats[3] = NaN;
  assert.equal(radar.readPacket(f.heap, 0, f.contract), null);
  assert.equal(radar.readPacket(f.heap, -1, f.contract), null);
  assert.equal(radar.readPacket(f.heap, 19, f.contract), null);
  assert.equal(radar.readPacket(f.heap, 0, {magic:[123,456],version:3,slots:{}}), null);
});
test('finished native objective vanishes while the actual player remains on the map', () => {
  const f = fixture(); f.heap[8] = 0;
  const p = radar.readPacket(f.heap, 0, f.contract);
  assert.equal(p.target, null); assert.equal(p.player.y, -1083);
});
test('optional unavailable 2D canvas cannot block the engine', () => {
  const r = radar.create({canvas:{getContext:()=>null},element:{}});
  assert.doesNotThrow(()=>{r.update(null);r.hide();r.dispose();});
});
