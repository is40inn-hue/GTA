'use strict';
// The emitted key stream and lifecycle are tested; this is not a native-physics
// or phone driving playthrough. revc.ini is the binding source of truth.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { create } = require('../dist/native-vc/drive-input.js');
const ROOT = path.resolve(__dirname, '..');

function stream() {
  const emitted = [], held = new Set();
  const control = create({ onKey: (code, down) => {
    down ? held.add(code) : held.delete(code);
    emitted.push([code, down]);
    assert(!(held.has('KeyA') && held.has('KeyD')), 'No opposing steering keys');
    assert(!(held.has('KeyW') && held.has('KeyS')), 'No simultaneous gas and brake');
  } });
  return { control, held, emitted };
}

test('RC4.7: centred thumb noise never steers or supplies throttle', () => {
  const h = stream();
  for(let n=0;n<300;n++){h.control.steer(Math.sin(n)*0.17);h.control.frame(n*16.7);}
  assert.equal(h.emitted.length,0);
  h.control.steer(0.55);h.control.frame(5011);
  assert(h.held.has('KeyD'),'deliberate steering responds without waiting for a whole pulse');
  assert(!h.held.has('KeyW')&&!h.held.has('KeyS'),'steering does not operate pedals');
  h.control.releaseSteering();assert.equal(h.held.size,0,'release has no delayed turn');
});

function ratio(value, hz=60) {
  const h = stream(), dt=1000/hz;
  h.control.steer(value);let down=0,total=0;
  for(let t=0;t<=8000;t+=dt){h.control.frame(t);if(t>=1000){total++;down+=Number(h.held.has('KeyD'));}}
  return down/total;
}
test('RC4.7: small steering is gentler, bounded and substantially frame independent', () => {
  const low=ratio(.4),medium=ratio(.7),full=ratio(1);
  assert(low<medium&&medium<full,{low,medium,full});
  assert(full<.9&&full>.65,'edge of pad does not lock full native steering continuously');
  assert(Math.abs(ratio(.7,30)-ratio(.7,60))<.07,'30/60 Hz duty remains close');
  assert(Math.abs(ratio(.7,120)-ratio(.7,60))<.07,'60/120 Hz duty remains close');
});

test('RC4.7: switching steering direction releases old key before new direction', () => {
  const h=stream();h.control.steer(-1);
  for(let t=0;t<=500;t+=10)h.control.frame(t);
  h.control.steer(1);h.control.frame(510);
  assert(!h.held.has('KeyA')&&!h.held.has('KeyD'),'brief neutral beat on reversal');
  for(let t=520;t<1200;t+=10)h.control.frame(t);
  assert(h.emitted.some(([code,on])=>code==='KeyD'&&on));
  h.control.steer(0);assert(!h.held.has('KeyA')&&!h.held.has('KeyD'));
});

test('RC4.7: progressive gas, real brake binding, fresh gas after braking', () => {
  const h=stream();h.control.setGas(true);h.control.frame(0);
  assert(h.held.has('KeyW'));assert.equal(h.control.snapshot().gasLevel,.4);
  for(let t=10;t<=460;t+=10)h.control.frame(t);
  assert.equal(h.control.snapshot().gasLevel,1);
  h.control.setBrake(true);assert(h.held.has('KeyS'));assert(!h.held.has('KeyW'));
  assert.equal(h.control.setGas(true),false,'brake wins an overlapping pedal touch');
  h.control.setBrake(false);h.control.frame(470);
  assert.equal(h.held.size,0,'old gas is not resumed after brake');
  h.control.setGas(true);h.control.frame(480);assert(h.held.has('KeyW'));
  h.control.releaseSteering();assert(h.held.has('KeyW'),'lifting steering thumb keeps deliberate pedal');
  h.control.setGas(false);assert(!h.held.has('KeyW'));
  const ini=fs.readFileSync(path.join(ROOT,'dist/native-vc/revc.ini'),'utf8');
  assert.match(ini,/VEHICLE_BRAKE=2ndKbd:S/);
  assert.match(ini,/VEHICLE_HANDBRAKE=.*SPC/);
  assert(!h.emitted.some(([code])=>code==='Space'),'touch brake never sends handbrake');
});

test('RC4.7: pause/reset or a long frame stall never replays held input', () => {
  for(const event of ['clear','stall','reverse-clock']) {
    const h=stream();h.control.steer(1);h.control.setGas(true);h.control.frame(0);h.control.frame(20);
    if(event==='clear')h.control.clear();else h.control.frame(event==='stall'?800:-1);
    assert.equal(h.held.size,0,event);
    h.control.frame(810);h.control.frame(830);assert.equal(h.held.size,0,event+' stays clear');
  }
});

const harnessSource=fs.readFileSync(path.join(__dirname,'vice-port.test.cjs'),'utf8').split("test('VM contract:")[0];
function makeHarness(options={}) {
  const context={require,console,__dirname,__filename:path.join(__dirname,'vice-port.test.cjs'),Buffer,URL,URLSearchParams,TextEncoder,AbortController,Blob,process,setTimeout,clearTimeout};
  vm.runInNewContext(harnessSource+'\nthis.make=makeHarness;',context,{timeout:2000});
  return context.make(options);
}

function attachKeys(h) {
  const keys=new Set(),events=[];
  for(const type of ['keydown','keyup'])h.document.addEventListener(type,e=>{type==='keydown'?keys.add(e.code):keys.delete(e.code);events.push([e.code,type]);});
  const stick=h.nodes.get('drive-stick');stick.getBoundingClientRect=()=>({x:0,y:0,width:140,height:140});
  return {keys,events};
}

test('RC4.7 native bridge: walking remains two-axis; in-car pad ignores vertical drag',async()=>{
  const h=makeHarness({edition:10});
  try {
    await h.boot();h.playing(2);const k=attachKeys(h);
    h.pointer('drive-stick','pointerdown',{pointerId:11,clientX:70,clientY:30});
    assert(k.keys.has('KeyW'),'on-foot forward unchanged');
    h.pointer('drive-stick','pointerup',{pointerId:11});assert(!k.keys.has('KeyW'));
    h.setPacket({inCar:1,hijacked:1});h.frame();
    assert.equal(h.document.body.dataset.driving,'true');
    h.pointer('drive-stick','pointerdown',{pointerId:12,clientX:70,clientY:70});
    h.pointer('drive-stick','pointermove',{pointerId:12,clientX:70,clientY:5});
    for(let i=0;i<16;i++)h.frame();
    assert(!k.keys.has('KeyW')&&!k.keys.has('KeyS'),'vertical thumb motion is not a pedal');
    h.pointer('drive-gas','pointerdown',{pointerId:13});h.frame();assert(k.keys.has('KeyW'));
    h.pointer('drive-stick','pointerup',{pointerId:12});assert(k.keys.has('KeyW'));
    h.pointer('drive-brake','pointerdown',{pointerId:14});assert(k.keys.has('KeyS'));assert(!k.keys.has('KeyW'));assert(!k.keys.has('Space'));
    h.pointer('drive-brake','pointercancel',{pointerId:14});assert(!k.keys.has('KeyS'));
    h.frame();assert(!k.keys.has('KeyW'),'cancelled old gas needs a fresh touch');
    h.pointer('drive-gas','pointerdown',{pointerId:15});h.frame();assert(k.keys.has('KeyW'));
    h.pointer('drive-gas','pointercancel',{pointerId:15});assert(!k.keys.has('KeyW'),'cancelled gas never remains held');
  } finally {h.destroy();}
});

test('RC4.7 native bridge: hold-to-exit, blur/pause releases, mode switch cancels touches',async()=>{
  const h=makeHarness({edition:10});
  try {
    await h.boot();h.playing(2);const k=attachKeys(h);h.setPacket({inCar:1,hijacked:1});h.frame();
    h.pointer('drive-enter','pointerdown',{pointerId:10});assert(!k.keys.has('KeyF'));
    h.pointer('drive-enter','pointerup',{pointerId:10});assert(!k.keys.has('KeyF'),'stray tap cannot exit');
    assert(!Array.from(h.timers.values()).some(timer=>timer.delay===450),'cancel removes exit timer');
    h.pointer('drive-gas','pointerdown',{pointerId:11});h.frame();assert(k.keys.has('KeyW'));
    h.pointer('drive-enter','pointerdown',{pointerId:12});
    const entry=Array.from(h.timers.entries()).find(([,timer])=>timer.delay===450);assert(entry);
    h.timers.delete(entry[0]);entry[1].fn();assert(k.keys.has('KeyF'));assert(!k.keys.has('KeyW'),'deliberate exit first releases gas');
    h.blur();assert.equal(k.keys.size,0);
    h.pointer('drive-gas','pointerdown',{pointerId:13});h.frame();assert(k.keys.has('KeyW'));
    h.nodes.get('native-pause').onclick();assert.equal(k.keys.size,0);
    h.nodes.get('native-resume').onclick();h.frame();assert.equal(k.keys.size,0,'no stale touch after resume');
    h.pointer('drive-gas','pointerdown',{pointerId:14});h.frame();
    h.setPacket({inCar:0});h.frame();assert.equal(k.keys.size,0);assert.equal(h.document.body.dataset.driving,'false');
  } finally {h.destroy();}
});
