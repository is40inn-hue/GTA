'use strict';

// Emitted-SCM control-flow checks with explicit native-query fixtures.
// This does not execute WASM, render pedestrians, or verify native combat on GPU.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const scriptRoot = path.join(root, 'scripts/native-scm');
const bytes = fs.readFileSync(path.join(root, 'dist/native-vc/range.scm'));
const config = JSON.parse(fs.readFileSync(path.join(root, 'dist/native-vc/range-config.json')));
const contract = JSON.parse(fs.readFileSync(path.join(scriptRoot, 'native-exam-main.contract.json')));
const catalog = JSON.parse(fs.readFileSync(path.join(scriptRoot, 'vc-opcodes.json')));
const commands = new Map(catalog.extensions.find(e => e.name === 'default').commands.map(c => [parseInt(c.id, 16), c]));
const labels = contract.validation.labels;
const fieldAddress = Object.fromEntries(Object.entries(contract.fields).map(([k,v]) => [k, contract.globalByteOffset + v.offset]));
const addressField = Object.fromEntries(Object.entries(fieldAddress).map(([k,v]) => [v,k]));
const hash = data => createHash('sha256').update(data).digest('hex');
const canon = x => Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canon(x[k])])) : x;
const rows = [], rowAt = new Map();
for (let offset = contract.validation.codeStart; offset < bytes.length;) {
  const at = offset, opcode = bytes.readUInt16LE(offset); offset += 2;
  const command = commands.get(opcode); assert(command, 'Known VC opcode at ' + at);
  const args = [];
  for (const param of [...(command.input || []), ...(command.output || [])]) {
    if (param.type === 'string') { args.push(bytes.subarray(offset, offset + 8).toString('latin1').replace(/\0.*$/, '')); offset += 8; continue; }
    const type = bytes[offset++];
    if (type === 1) { args.push(bytes.readInt32LE(offset)); offset += 4; }
    else if (type === 2) { args.push({ global: bytes.readUInt16LE(offset) }); offset += 2; }
    else if (type === 6) { args.push(bytes.readFloatLE(offset)); offset += 4; }
    else throw new Error('Unexpected parameter type ' + type + ' at ' + at);
  }
  const row = { at, opcode, name: command.name, args, next: offset };
  rows.push(row); rowAt.set(at, row);
}

function machine(initial = {}, supplied = {}) {
  const state = Object.assign({ phase: 2, scene: 1, player: 0, pickupCollected: 1, pickup: 50, pickupBlip: -1,
    ambient0: 31, ambient1: 32, ambient2: 33, ambientState: 0, nativeTimer: 1000, copCar: -1 }, initial);
  const calls = [], writes = [], living = new Set([31,32,33]);
  const fixture = Object.assign({ exists: true, dead: false, near: true, collected: false,
    carHealth: {}, deadCars: new Set(), weaponDamage: {}, carCoords: {} }, supplied);
  function run(from, to) {
    let pc = labels[from], condition = false;
    const stops = (Array.isArray(to) ? to : [to]).map(name => labels[name]);
    const value = v => v && typeof v === 'object' ? state[addressField[v.global]] || 0 : v;
    const put = (dest, next) => { assert(dest && typeof dest.global === 'number'); const name = addressField[dest.global]; assert(name); state[name] = next; writes.push(name); };
    for (let step = 0; step < 500; step++) {
      if (stops.includes(pc)) return pc;
      const row = rowAt.get(pc); assert(row, 'Valid instruction boundary ' + pc); pc = row.next;
      const a = row.args.map(value);
      switch (row.opcode) {
        case 0x00D6: break; // IF
        case 0x0004: case 0x0084: put(row.args[0], a[1]); break;
        case 0x0008: put(row.args[0], a[0] + a[1]); break;
        case 0x0038: case 0x003A: condition = a[0] === a[1]; break;
        case 0x0028: condition = a[0] >= a[1]; break;
        case 0x0018: case 0x001C: condition = a[0] > a[1]; break;
        case 0x0002: pc = a[0]; break;
        case 0x004D: if (!condition) pc = a[0]; break;
        case 0x056D: condition = fixture.exists && living.has(a[0]); break;
        case 0x0118: condition = fixture.dead; break;
        case 0x00FC: condition = fixture.near; break;
        case 0x0214: condition = fixture.collected; break;
        case 0x031E: condition = (fixture.weaponDamage[a[0]] || []).includes(a[1]); break;
        case 0x0119: condition = fixture.deadCars.has(a[0]); break;
        case 0x0227: put(row.args[1], fixture.carHealth[a[0]]); break;
        case 0x00AA: {
          const coords = fixture.carCoords[a[0]]; assert(coords, 'Explicit native coordinate fixture');
          for (let i=0;i<3;i++) put(row.args[i+1],coords[i]);
          break;
        }
        case 0x009B: living.delete(a[0]); calls.push([row.opcode, a]); break;
        case 0x01CA: case 0x01D0: case 0x03A1: case 0x01B8: case 0x0164: calls.push([row.opcode, a]); break;
        default: throw new Error('Unexpected command in focused trace: ' + row.name);
      }
    }
    throw new Error('Trace did not terminate');
  }
  return { state, calls, writes, fixture, run };
}

test('RC4.2 native output matches the packaged contract and preserves grading, ammunition, and ABI', () => {
  assert.deepEqual(bytes, fs.readFileSync(path.join(scriptRoot, 'native-exam-main.scm')));
  assert.equal(hash(bytes), config.sha256); assert.equal(config.sha256, contract.sha256); assert.equal(bytes.length, config.size);
  const gradingKeys = ['scene','action','weapon','model','ammo','burst','pointsPerTarget','targetPoints','targetCount'];
  const semantics = { version:config.version, magic:config.magic, slots:config.slots, phases:config.phases,
    commands:config.commands, result:config.result, contentEdition:config.contentEdition,
    scenes:config.scenes.map(scene => Object.fromEntries(gradingKeys.filter(key => key in scene).map(key => [key,scene[key]]))) };
  // Captured from the unchanged RC4 before RC4.2: world geometry and target
  // appearance may change, but the protocol, score weights and ammo may not.
  assert.equal(hash(JSON.stringify(canon(semantics))), 'a898c01f34fa06aa7dbd275398267425e3b8a4a9e2597564b4f03a46dccf461c');
  assert.equal(new Set(Object.values(config.slots)).size, Object.keys(config.slots).length);
  assert.deepEqual(Object.entries(config.slots).filter(([name]) => name.startsWith('ambient')),
    [['ambient0',158],['ambient1',159],['ambient2',160],['ambientState',161],['ambientAttackUntil',162],['ambientRemoveAt',163]]);
  for (const row of rows) if ([0x0002,0x004D].includes(row.opcode)) assert(rowAt.has(row.args[0]), 'Branch lands on an instruction');
});

test('RC4.2 RPG pickup is two metres ahead beside the ramp, with one native marker until collection', () => {
  const scene = config.scenes[2];
  assert.deepEqual(scene.spawn, [263,-1270,11.5]);
  assert.deepEqual(scene.pickup, [263,-1272,11.5]); assert.equal(scene.pickup[2], scene.spawn[2]);
  assert.equal(Math.hypot(scene.pickup[0]-scene.spawn[0], scene.pickup[1]-scene.spawn[1]), 2);
  assert.equal(scene.positions[0][0],scene.spawn[0], 'First target is directly ahead of spawn');
  const waiting = machine({ scene:3, pickupCollected:0 }); waiting.run('shooting', 'check_timeout');
  const markers = waiting.calls.filter(([op]) => op === 0x03A1);
  assert.equal(markers.length, 1); assert.deepEqual(markers[0][1].slice(0,3), scene.pickup);
  assert(Math.abs(markers[0][1][3] - 2.4) < 0.00001);
  const collected = machine({ scene:3, pickupCollected:0, weapon:30 }, { collected:true });
  collected.run('shooting', 'weapon_ready'); assert.equal(collected.state.pickupCollected, 1);
  assert.equal(collected.calls.some(([op]) => op === 0x03A1), false);
  assert(collected.calls.some(([op,args]) => op === 0x01B8 && args[1] === 30));
  const other = machine({ scene:1, pickupCollected:0 }); other.run('shooting','check_timeout');
  assert.equal(other.calls.some(([op]) => op === 0x03A1), false);
});

test('RC2 ambient attack triggers once, is bounded, flees, and cleans up without writing score data', () => {
  const m = machine();
  m.run('gameplay','ambient_done'); assert.equal(m.state.ambientState,1);
  assert.equal(m.state.ambientAttackUntil,3200);
  m.state.nativeTimer=3199; m.run('gameplay','ambient_done'); assert.equal(m.state.ambientState,1);
  m.state.nativeTimer=3201; m.run('gameplay','ambient_done'); assert.equal(m.state.ambientState,2);
  assert.equal(m.state.ambientRemoveAt,6701);
  m.state.nativeTimer=6700; m.run('gameplay','ambient_done'); assert.equal(m.state.ambientState,2);
  m.state.nativeTimer=6702; m.run('gameplay','ambient_done'); assert.equal(m.state.ambientState,3); assert.equal(m.state.ambient2,-1);
  for (let i=0;i<5;i++) { m.state.nativeTimer+=10000; m.run('gameplay','ambient_done'); }
  assert.deepEqual(m.calls.map(([op]) => op), [0x01CA,0x01D0,0x009B]);
  assert(m.writes.every(name => name.startsWith('ambient')));
});

test('RC2 NPC episode never starts before pickup, out of range, in other scenes, or on invalid/dead actors', () => {
  for (const [initial, fixture] of [[{pickupCollected:0},{}],[{}, {near:false}],[{scene:2},{}],[{scene:3},{}],[{}, {exists:false}],[{}, {dead:true}]]) {
    const m=machine(initial,fixture); m.run('gameplay','ambient_done');
    assert.equal(m.calls.some(([op]) => op === 0x01CA),false);
    assert(m.writes.every(name => name.startsWith('ambient')));
  }
});

test('RC2 all ambient handles are cleaned at a terminal transition, including an interrupted attack', () => {
  for (const scene of [1,2,3]) for (const ambientState of [0,1,2,3]) {
    const m=machine({scene,ambientState}); m.run('finish_scene','no_finish_cop');
    assert.deepEqual(m.calls.filter(([op]) => op === 0x009B).map(([,args]) => args[0]),[31,32,33]);
    assert.deepEqual([m.state.ambient0,m.state.ambient1,m.state.ambient2],[-1,-1,-1]); assert.equal(m.state.ambientState,3);
  }
});

test('RC2 civilians reuse the real packaged male01 model and are confined to C1', () => {
  const creates = rows.filter(row => row.opcode === 0x009A && row.at >= labels.new_scene1 && row.at < labels.prepare2);
  assert.equal(creates.length,3); assert(creates.every(row => row.args[0] === 4 && row.args[1] === 7));
  assert.equal(rows.filter(row => row.opcode === 0x009A && row.at >= labels.new_scene3).length,0);
  assert.deepEqual(rows.filter(row => row.opcode === 0x0247).map(row => row.args[0]),[7,1,130,156,217,282,287]);
  const model=fs.readFileSync(path.join(root,'dist/native-vc/runtime/remote/models/gta3.img/male01.dff'));
  assert.equal(hash(model),'e354e60f0ceef6eb14960c4cdd612f51f1715b437cf2c41a73b05a2c10e02b4f');
});

test('RC4.2 C1 uses a parked native Maverick that can take real bullet/fire damage and is removed before C2', () => {
  const scene=config.scenes[0], target=fieldAddress.target0_handle;
  assert.deepEqual(scene.targetModels,[217]); assert.equal(scene.groundedTarget,true);
  const own=rows.filter(row=>row.at>=labels.new_scene1&&row.at<labels.prepare2);
  const targetRows=own.filter(row=>row.args[0]?.global===target);
  const create=own.find(row=>row.opcode===0x00A5&&row.args[4]?.global===target);
  assert.equal(create.args[0],217);
  assert(targetRows.some(row=>row.opcode===0x0519&&row.args[1]===1),'Parked position is frozen');
  assert(targetRows.some(row=>row.opcode===0x0224&&row.args[1]===320));
  assert(targetRows.some(row=>row.opcode===0x0175&&row.args[1]===90));
  assert(targetRows.some(row=>row.opcode===0x03F5&&row.args[1]===1),'Native damage remains enabled');
  assert.deepEqual(targetRows.find(row=>row.opcode===0x02AC).args.slice(1),[0,0,1,1,1]);
  assert.equal(own.some(row=>row.opcode===0x04A2),false,'No scripted flight in C1');
  assert.equal(own.some(row=>row.opcode===0x036A),false,'No driver is placed in C1 helicopter');
  const next=rows.filter(row=>row.at>=labels.new_scene2&&row.at<labels.prepare3);
  assert(next.find(row=>row.opcode===0x00A6&&row.args[0]?.global===target).at <
    next.find(row=>row.opcode===0x00A5&&row.args[4]?.global===target).at,'Old target is removed before the chase car spawns');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/native-vc/runtime/manifest.json')));
  for(const extension of ['dff','txd']){
    const entry=manifest.models.files.find(file=>file.path.endsWith(`/maverick.${extension}`));assert(entry);
    const body=fs.readFileSync(path.join(root,'dist/native-vc/runtime',entry.path));
    assert.equal(body.length,entry.size);assert.equal(hash(body),entry.sha256);
  }
});

test('RC4.2 the two peaceful pedestrians react once to a native-confirmed first hit, without changing attack or score state', () => {
  const initial={scene:1,weapon:23,target0_handle:101,target0_baseline:320,target0_health:300,target0_rpgHit:0};
  const m=machine(initial,{weaponDamage:{101:[23]}});
  m.run('bullet0','count0');
  assert.deepEqual(m.calls.filter(([op])=>op===0x01D0).map(([,args])=>args[0]),[31,32]);
  assert.equal(m.state.target0_rpgHit,1);assert.equal(m.state.ambientState,0);
  assert(m.writes.every(name=>name==='target0_rpgHit'));
  m.run('bullet0','count0');assert.equal(m.calls.filter(([op])=>op===0x01D0).length,2,'Second hit does not restart fleeing');
  for(const [changes,fixture] of [[{},{}],[{target0_health:320},{weaponDamage:{101:[23]}}],
    [{target0_rpgHit:1},{weaponDamage:{101:[23]}}],[{}, {weaponDamage:{101:[23]},exists:false}],
    [{}, {weaponDamage:{101:[23]},dead:true}]]){
    const other=machine({...initial,...changes},fixture);other.run('bullet0','count0');
    assert.equal(other.calls.some(([op])=>op===0x01D0),false);
  }
});

test('RC4.2 finale draws at most one marker for a surviving uncredited target in every target-state combination', () => {
  assert.deepEqual(config.scenes[2].guidanceOrder,[0,1,2]);
  const carCoords={101:[263,-1308,11.2],102:[258,-1327,11.2],103:[249,-1340,25]};
  for(let mask=0;mask<64;mask++){
    const initial={scene:3};let wanted=-1;
    for(let i=0;i<3;i++){
      const credited=(mask>>(i*2))&1,destroyed=(mask>>(i*2+1))&1;
      Object.assign(initial,{[`target${i}_handle`]:101+i,[`target${i}_credited`]:credited,[`target${i}_destroyed`]:destroyed});
      if(wanted<0&&!credited&&!destroyed)wanted=i;
    }
    const m=machine(initial,{carCoords});m.run('finale_marker','finale_marker_done');
    const markers=m.calls.filter(([op])=>op===0x03A1);
    assert.equal(markers.length,wanted<0?0:1);
    if(wanted>=0)assert.deepEqual(markers[0][1].slice(0,3),carCoords[101+wanted]);
    assert(m.writes.every(name=>['heliX','heliY','heliZ'].includes(name)),'Guidance cannot credit a target or change ammo');
  }
  const other=machine({scene:1},{carCoords});other.run('finale_marker','finale_marker_done');assert.equal(other.calls.length,0);
});

test('RC4.2 C1 draws the promised red marker on the live helicopter after pickup and never on a wreck', () => {
  const carCoords={101:config.scenes[0].positions[0]};
  for(const [credited,destroyed] of [[0,0],[1,0],[0,1],[1,1]]){
    const m=machine({scene:1,target0_handle:101,target0_credited:credited,target0_destroyed:destroyed},{carCoords});
    m.run('c1_target_marker','finale_marker');
    const markers=m.calls.filter(([op])=>op===0x03A1);
    assert.equal(markers.length,!credited&&!destroyed?1:0);
    if(markers.length)assert.deepEqual(markers[0][1],carCoords[101].concat(5));
    assert(m.writes.every(name=>['heliX','heliY','heliZ'].includes(name)));
  }
  const waiting=machine({scene:1,pickupCollected:0});waiting.run('shooting','check_timeout');
  assert.equal(waiting.calls.some(([op])=>op===0x03A1),false,'Target marker cannot replace the uncollected weapon');
  const other=machine({scene:3},{carCoords});other.run('c1_target_marker','finale_marker');assert.equal(other.calls.length,0);
});

test('RC4.2 out-of-order RPG target credit still requires native weapon damage, spent ammo, health loss and destruction', () => {
  const initial={scene:3,ammoInitial:6,ammo:5,targetCount:3};
  for(let i=0;i<3;i++)Object.assign(initial,{[`target${i}_handle`]:101+i,[`target${i}_baseline`]:450});
  const fixture={carHealth:{101:450,102:450,103:0},deadCars:new Set([103]),weaponDamage:{103:[41]}};
  const m=machine(initial,fixture);m.run('after_heli_route','finale_marker');
  assert.equal(m.state.target2_credited,1,'Helicopter can be credited before either car');
  assert.equal(m.state.creditedCount,1);assert.equal(m.state.target0_credited||0,0);assert.equal(m.state.target1_credited||0,0);
  for(const [changes,replacements] of [[{ammo:6},{}],[{}, {weaponDamage:{}}],
    [{},{carHealth:{101:450,102:450,103:450}}],[{}, {deadCars:new Set()}]]){
    const invalid=machine({...initial,...changes},{...fixture,...replacements});
    invalid.run('after_heli_route','finale_marker');assert.equal(invalid.state.target2_credited||0,0);
  }
  assert.equal(m.state.ammo,5,'Credit logic cannot issue ammunition');
});
